import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const origin = 'http://localhost:3000'

let ip = 120

function post(path: string, body: unknown, cookie = '', method = 'POST') {
  return fetch(url(path), {
    method,
    headers: {
      'content-type': 'application/json',
      origin,
      cookie,
      'x-real-ip': `192.0.2.${ip++}`,
    },
    body: JSON.stringify(body),
  })
}

async function account() {
  const email = `notes-${randomUUID()}@example.test`
  const password = 'Abcdef1!'

  expect((await post('/api/registration', { email, password })).status).toBe(202)

  const messages = await $fetch<{ to: string, text: string }[]>('/__test/mail')
  const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

  await fetch(url(link.pathname + link.search), { redirect: 'manual' })

  const response = await post('/api/login', { email, password })

  expect(response.status).toBe(200)

  return {
    email,
    cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '),
  }
}

function get(path: string, cookie: string) {
  return fetch(url(path), {
    headers: { cookie },
  })
}

describe('private notes HTTP contract', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
    env: { MAILTRAP_URL: '' },
    nuxtConfig: {
      nitro: {
        handlers: [
          {
            route: '/__test/mail',
            handler: fileURLToPath(new URL('../fixtures/mail.ts', import.meta.url)),
          },
          {
            route: '/__test/auth-state',
            handler: fileURLToPath(new URL('../fixtures/auth-state.ts', import.meta.url)),
          },
          {
            route: '/__test/note-state',
            handler: fileURLToPath(new URL('../fixtures/note-state.ts', import.meta.url)),
          },
        ],
      },
    },
  })

  it('explicitly creates a private plain-text note and reopens it through fresh HTTP requests', async () => {
    const { cookie } = await account()
    const before = Date.now()
    const response = await post('/api/notes', {
      title: '  My first note  ',
      content: '  First paragraph\r\n\r\nSecond paragraph\r  <b>plain text</b>  \n',
      tags: [
        ' Work ',
        'work',
        'Planning',
        'PLANNING',
      ],
    }, cookie)

    expect(response.status).toBe(201)

    const note = await response.json()

    expect(note).toEqual({
      id: expect.any(String),
      title: 'My first note',
      content: '  First paragraph\n\nSecond paragraph\n  <b>plain text</b>  \n',
      tags: ['Work', 'Planning'],
      lastEdited: expect.any(String),
      isArchived: false,
      version: 1,
    })
    expect(Date.parse(note.lastEdited)).toBeGreaterThanOrEqual(before)
    expect(new Date(note.lastEdited).toISOString()).toBe(note.lastEdited)
    expect(await (await get(`/api/notes/${note.id}`, cookie)).json()).toEqual(note)
    expect(await (await get('/api/notes', cookie)).json()).toEqual({
      notes: [note],
    })
  })

  it('explicitly edits title, content and tags using the observed version', async () => {
    const { cookie } = await account()
    const original = await (await post('/api/notes', { title: 'Original' }, cookie)).json()
    const response = await post(`/api/notes/${original.id}`, {
      title: '  Edited  ',
      content: 'First\r\n\r\n<b>plain</b>  ',
      tags: [' Work ', 'work', 'Planning'],
      version: original.version,
    }, cookie, 'PUT')

    expect(response.status).toBe(200)

    const edited = await response.json()

    expect(edited).toEqual({
      ...original,
      title: 'Edited',
      content: 'First\n\n<b>plain</b>  ',
      tags: ['Work', 'Planning'],
      version: 2,
      lastEdited: expect.any(String),
    })
    expect(Date.parse(edited.lastEdited)).toBeGreaterThan(Date.parse(original.lastEdited))
    expect(await (await get(`/api/notes/${original.id}`, cookie)).json()).toEqual(edited)
    expect(await (await get('/api/notes', cookie)).json()).toEqual({
      notes: [edited],
    })
  })

  it('accepts only one competing edit and rejects even a stale no-op without overwriting', async () => {
    const { cookie } = await account()
    const original = await (await post('/api/notes', { title: 'Original' }, cookie)).json()
    const path = `/api/notes/${original.id}`
    const results = await Promise.all(['First edit', 'Second edit'].map(title => post(path, {
      title,
      version: 1,
    }, cookie, 'PUT')))

    expect(results.map(result => result.status).sort()).toEqual([200, 409])

    const winner = await results.find(result => result.status === 200)!.json()
    const loser = await results.find(result => result.status === 409)!.json()

    expect(loser).toEqual({
      error: { code: 'NOTE_VERSION_CONFLICT' },
    })
    expect(winner.version).toBe(2)
    expect(await (await get(path, cookie)).json()).toEqual(winner)

    const staleNoop = await post(path, { title: winner.title, version: 1 }, cookie, 'PUT')

    expect(staleNoop.status).toBe(409)
    expect(await (await get(path, cookie)).json()).toEqual(winner)
  })

  it('leaves version, timestamp and list ordering unchanged for normalized no-op saves', async () => {
    const { cookie } = await account()
    const original = await (await post('/api/notes', {
      title: 'First',
      content: 'One\n\nTwo',
      tags: ['Work'],
    }, cookie)).json()
    const newer = await (await post('/api/notes', { title: 'Newer' }, cookie)).json()
    const response = await post(`/api/notes/${original.id}`, {
      title: '  First ',
      content: 'One\r\n\r\nTwo',
      tags: [' Work ', 'work'],
      version: 1,
    }, cookie, 'PUT')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(original)
    expect(await (await get('/api/notes', cookie)).json()).toEqual({
      notes: [newer, original],
    })

    const edited = await (await post(`/api/notes/${original.id}`, {
      title: 'First',
      content: 'One\n\nTwo',
      tags: [],
      version: 1,
    }, cookie, 'PUT')).json()

    expect(edited).toMatchObject({ tags: [], version: 2 })
    expect((await (await get('/api/notes', cookie)).json()).notes.map((note: { id: string }) => note.id)).toEqual([original.id, newer.id])
  })

  it('protects edit ownership, authoritative validation, origin and removed or archived records', async () => {
    const owner = await account()
    const other = await account()
    const original = await (await post('/api/notes', { title: 'Private' }, owner.cookie)).json()
    const path = `/api/notes/${original.id}`
    const input = { title: 'Edited', version: 1 }

    expect((await post(path, input, '', 'PUT')).status).toBe(401)

    for (const id of [
      original.id,
      randomUUID(),
      'invalid',
    ]) {
      const response = await post(`/api/notes/${id}`, input, other.cookie, 'PUT')

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: { code: 'NOTE_NOT_FOUND' },
      })
    }

    for (const body of [
      { title: '', version: 1 },
      {
        title: 'x'.repeat(201),
        version: 1,
      },
      {
        ...input,
        content: 'x'.repeat(100001),
      },
      {
        ...input,
        tags: [
          'x'.repeat(51),
        ],
      },
      {
        ...input,
        tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
      },
      { title: 'Missing version' },
      ...[0, -1, 1.5, '1', null].map(version => ({ ...input, version })),
      ...[
        'ownerId',
        'id',
        'lastEdited',
        'isArchived',
      ].map(key => ({ ...input, [key]: 'forged' })),
    ]) {
      const response = await post(path, body, owner.cookie, 'PUT')

      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({
        error: {
          code: 'VALIDATION',
          fields: expect.any(Object),
        },
      })
    }

    expect((await fetch(url(path), {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'origin': 'https://evil.example', 'cookie': owner.cookie },
      body: JSON.stringify(input),
    })).status).toBe(403)

    for (const [body, status] of [
      ['{', 400],
      [
        JSON.stringify({
          ...input,
          content: 'x'.repeat(700000),
        }),
        413,
      ],
    ] as const) {
      expect((await fetch(url(path), {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin, 'cookie': owner.cookie },
        body,
      })).status).toBe(status)
    }

    expect(await (await get(path, owner.cookie)).json()).toEqual(original)

    await $fetch('/__test/note-state', {
      method: 'POST',
      body: { id: original.id, lastEdited: original.lastEdited, isArchived: true },
    })
    expect((await post(path, input, owner.cookie, 'PUT')).status).toBe(409)
    await $fetch('/__test/note-state', {
      method: 'POST',
      body: { id: original.id, remove: true },
    })

    const removed = await post(path, input, owner.cookie, 'PUT')

    expect(removed.status).toBe(404)
    expect(await removed.json()).toEqual({
      error: { code: 'NOTE_NOT_FOUND' },
    })

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email: owner.email, unverify: true },
    })
    expect((await post(path, input, owner.cookie, 'PUT')).status).toBe(403)
  })

  it('rejects anonymous and unverified access and conceals other owners’ notes', async () => {
    const owner = await account()
    const other = await account()
    const note = await (await post('/api/notes', { title: 'Private' }, owner.cookie)).json()

    for (const path of ['/api/notes', `/api/notes/${note.id}`]) {
      expect((await get(path, '')).status).toBe(401)
    }

    expect((await post('/api/notes', { title: 'Anonymous' })).status).toBe(401)
    expect(await (await get('/api/notes', other.cookie)).json()).toEqual({ notes: [] })

    for (const id of [
      note.id,
      randomUUID(),
      'invalid',
    ]) {
      const response = await get(`/api/notes/${id}`, other.cookie)

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: { code: 'NOTE_NOT_FOUND' },
      })
    }

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email: owner.email, unverify: true },
    })

    for (const path of ['/api/notes', `/api/notes/${note.id}`]) {
      expect((await get(path, owner.cookie)).status).toBe(403)
    }

    expect((await post('/api/notes', { title: 'Denied' }, owner.cookie)).status).toBe(403)
  })

  it('validates exact limits and never accepts client-owned identity, archive, clock, or version fields', async () => {
    const { cookie } = await account()
    const invalid = [
      { title: '' },
      { title: ' \t\n ' },
      {
        title: 'x'.repeat(201),
      },
      {
        title: 'Body',
        content: 'x'.repeat(100001),
      },
      {
        title: 'Tags',
        tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
      },
      {
        title: 'Tag length',
        tags: [
          'x'.repeat(51),
        ],
      },
      { title: 'Wrong types', tags: 'Work, Planning' },
      ...[
        'id',
        'ownerId',
        'owner_id',
        'lastEdited',
        'version',
        'isArchived',
      ].map(key => ({ title: 'Forged', [key]: 'forged' })),
    ]

    for (const body of invalid) {
      const response = await post('/api/notes', body, cookie)

      expect(response.status, JSON.stringify(body).slice(0, 100)).toBe(422)
      expect(await response.json()).toMatchObject({
        error: {
          code: 'VALIDATION',
          fields: expect.any(Object),
        },
      })
    }

    expect(await (await get('/api/notes', cookie)).json()).toEqual({ notes: [] })

    const boundary = {
      title: 'x'.repeat(200),
      content: 'x'.repeat(100000),
      tags: Array.from({ length: 20 }, (_, i) => `${i}`.padEnd(50, 'x')),
    }

    expect((await post('/api/notes', boundary, cookie)).status).toBe(201)

    const minimal = await post('/api/notes', { title: 'Title only' }, cookie)

    expect(minimal.status).toBe(201)
    expect(await minimal.json()).toMatchObject({
      title: 'Title only',
      content: '',
      tags: [],
      version: 1,
      isArchived: false,
    })
  })

  it('lists active notes newest-first with descending IDs breaking clock ties', async () => {
    const { cookie } = await account()
    const saved = []

    for (const title of [
      'Older',
      'Tie one',
      'Tie two',
      'Archived',
    ]) {
      saved.push(await (await post('/api/notes', { title }, cookie)).json())
    }

    for (const [index, note] of saved.entries()) {
      await $fetch('/__test/note-state', {
        method: 'POST',
        body: {
          id: note.id,
          lastEdited: index === 0
            ? '2026-01-01T00:00:00Z'
            : '2026-02-01T00:00:00Z',
          isArchived: index === 3,
        },
      })
    }

    const response = await get('/api/notes', cookie)
    const result = await response.json()
    const ties = [saved[1].id, saved[2].id].sort().reverse()

    expect(result.notes.map((note: { id: string }) => note.id)).toEqual([...ties, saved[0].id])
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await get(`/api/notes/${saved[3].id}`, cookie)).status).toBe(200)
  })

  it('rejects cross-origin creates, malformed JSON and oversized request streams without saving', async () => {
    const { cookie } = await account()

    for (const headers of [
      { 'content-type': 'application/json' },
      { 'content-type': 'application/json', 'origin': 'https://evil.example' },
      { 'content-type': 'text/plain', origin },
      { 'content-type': 'application/json', origin, 'sec-fetch-site': 'cross-site' },
    ]) {
      expect((await fetch(url('/api/notes'), {
        method: 'POST',
        headers: { ...headers, cookie },
        body: '{"title":"CSRF"}',
      })).status).toBe(403)
    }

    const request = (body: string) => fetch(url('/api/notes'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie },
      body,
    })

    expect((await request('{')).status).toBe(400)
    expect((await request(JSON.stringify({
      title: 'Huge',
      content: 'x'.repeat(700000),
    }))).status).toBe(413)
    expect(await (await get('/api/notes', cookie)).json()).toEqual({ notes: [] })
  })
})
