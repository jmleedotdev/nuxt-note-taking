import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const origin = 'http://localhost:3000'

let ip = 120

function post(path: string, body: unknown, cookie = '', method = 'POST') {
  const address = ip++

  return fetch(url(path), {
    method,
    headers: {
      'content-type': 'application/json',
      origin,
      cookie,
      'x-real-ip': `198.19.${Math.floor(address / 256)}.${address % 256}`,
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

  it('does not restrict non-demo accounts to ten saved notes', async () => {
    const { cookie } = await account()

    for (let index = 0; index < 12; index++)
      expect((await post('/api/notes', { title: `Unrestricted ${index}` }, cookie)).status).toBe(201)

    expect((await (await get('/api/notes', cookie)).json()).notes).toHaveLength(12)
  })

  it('searches saved titles, content and tags literally within the owner and archive scope', async () => {
    const { cookie } = await account()
    const saved = []

    for (const input of [
      {
        title: 'Needle title',
        tags: ['Work'],
      },
      {
        title: 'Body',
        content: 'A NEEDLE in text',
        tags: ['work'],
      },
      {
        title: 'Tagged',
        tags: ['Needle'],
      },
      {
        title: 'Literal %_\\ marker',
        tags: ['Archived only'],
      },
    ])
      saved.push(await (await post('/api/notes', input, cookie)).json())

    for (const note of saved.slice(0, 3)) {
      await $fetch('/__test/note-state', {
        method: 'POST',
        body: { id: note.id, lastEdited: '2026-01-01T00:00:00Z', isArchived: false },
      })
    }

    const ids = async (query: string, session = cookie) => (await (await get(`/api/notes?${query}`, session)).json()).notes.map((note: { id: string }) => note.id)
    const expected = saved.slice(0, 3).map(note => note.id).sort().reverse()

    expect(await ids('q=nEeDlE')).toEqual(expected)
    expect(await ids('q=')).toHaveLength(4)
    expect(await ids(`q=${encodeURIComponent('%_\\')}`)).toEqual([saved[3].id])
    expect(await ids('q=absent')).toEqual([])
    expect(await ids('tag=WORK')).toEqual(saved.slice(0, 2).map(note => note.id).sort().reverse())
    expect(await ids('tag=wor')).toEqual([])
    expect(await ids('tag=Work&q=Tagged')).toEqual([])
    await post(`/api/notes/${saved[3].id}/archive`, { version: 1 }, cookie)
    expect(await ids('q=Literal')).toEqual([])
    expect(await ids('archived=true&q=literal')).toEqual([saved[3].id])
    expect(await ids('archived=true&q=needle')).toEqual([])
    expect(await ids('tag=Archived%20only')).toEqual([])

    const other = await account()

    expect(await ids('q=needle', other.cookie)).toEqual([])
    expect(await (await get('/api/notes/tags', other.cookie)).json()).toEqual({ tags: [] })
    expect(await (await get('/api/notes/tags', cookie)).json()).toEqual({
      tags: ['Archived only', 'Needle', 'Work'],
    })
    expect((await get('/api/notes?q=needle', '')).status).toBe(401)
    expect((await get('/api/notes/tags', '')).status).toBe(401)
    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email: other.email, unverify: true },
    })
    expect((await get('/api/notes?q=needle', other.cookie)).status).toBe(403)
    expect((await get('/api/notes/tags', other.cookie)).status).toBe(403)
  })

  it('derives tags and filtered results from current persisted edits, archive, restore and deletion', async () => {
    const { cookie } = await account()
    const note = await (await post('/api/notes', {
      title: 'Before',
      tags: ['Old'],
    }, cookie)).json()
    const tags = async () => (await (await get('/api/notes/tags', cookie)).json()).tags

    expect(await tags()).toEqual(['Old'])
    await post(`/api/notes/${note.id}`, {
      title: 'After',
      tags: ['New'],
      version: 1,
    }, cookie, 'PUT')
    expect(await tags()).toEqual(['New'])
    expect(await (await get('/api/notes?q=Before', cookie)).json()).toEqual({ notes: [] })
    await post(`/api/notes/${note.id}/archive`, { version: 2 }, cookie)
    expect(await tags()).toEqual(['New'])
    expect(await (await get('/api/notes?tag=New', cookie)).json()).toEqual({ notes: [] })
    await post(`/api/notes/${note.id}/restore`, { version: 3 }, cookie)
    expect((await (await get('/api/notes?tag=new', cookie)).json()).notes).toHaveLength(1)
    await post(`/api/notes/${note.id}`, { version: 4 }, cookie, 'DELETE')
    expect(await tags()).toEqual([])
    expect(await (await get('/api/notes?q=After', cookie)).json()).toEqual({ notes: [] })

    for (const query of ['q=a&q=b', 'tag=a&tag=b', 'archived=invalid'])
      expect((await get(`/api/notes?${query}`, cookie)).status).toBe(422)
  })

  it('explicitly creates a private plain-text note and reopens it through fresh HTTP requests', async () => {
    const { cookie } = await account()
    // Notes use the database clock; Docker/remote PostgreSQL need not be
    // millisecond-synchronized with the test runner's host clock.
    const before = await (await post('/__test/note-state', { clock: true })).json()
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

    const after = await (await post('/__test/note-state', { clock: true })).json()

    expect(Date.parse(note.lastEdited)).toBeGreaterThanOrEqual(before.now)
    expect(Date.parse(note.lastEdited)).toBeLessThanOrEqual(after.now)
    expect(new Date(note.lastEdited).toISOString()).toBe(note.lastEdited)
    expect(await (await get(`/api/notes/${note.id}`, cookie)).json()).toEqual(note)
    expect(await (await get('/api/notes', cookie)).json()).toEqual({
      notes: [note],
    })
  })

  it('permanently deletes active and archived notes using their observed version', async () => {
    const { cookie } = await account()

    for (const archived of [false, true]) {
      let note = await (await post('/api/notes', {
        title: 'Delete permanently',
        tags: ['Temporary'],
      }, cookie)).json()

      if (archived)
        note = await (await post(`/api/notes/${note.id}/archive`, { version: 1 }, cookie)).json()

      const path = `/api/notes/${note.id}`
      const response = await post(path, { version: note.version }, cookie, 'DELETE')

      expect(response.status).toBe(204)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.text()).toBe('')
      expect((await get(path, cookie)).status).toBe(404)
      expect(await (await get('/api/notes', cookie)).json()).toEqual({ notes: [] })
      expect(await (await get('/api/notes?archived=true', cookie)).json()).toEqual({ notes: [] })
      expect((await post(`${path}/restore`, { version: note.version }, cookie)).status).toBe(404)
      expect((await post(path, { title: 'Resurrect', version: note.version }, cookie, 'PUT')).status).toBe(404)
      expect((await post(path, { version: note.version }, cookie, 'DELETE')).status).toBe(404)
    }
  })

  it('protects deletion with authentication, ownership, input validation and origin checks', async () => {
    const owner = await account()
    const other = await account()
    const note = await (await post('/api/notes', { title: 'Private' }, owner.cookie)).json()
    const path = `/api/notes/${note.id}`

    expect((await post(path, { version: 1 }, '', 'DELETE')).status).toBe(401)

    for (const id of [
      note.id,
      randomUUID(),
      'invalid',
    ]) {
      const response = await post(`/api/notes/${id}`, { version: 1 }, other.cookie, 'DELETE')

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: { code: 'NOTE_NOT_FOUND' },
      })
    }

    for (const body of [
      {},
      ...[0, -1, 1.5, '1', null].map(version => ({ version })),
      { version: 1, ownerId: owner.email },
    ])
      expect((await post(path, body, owner.cookie, 'DELETE')).status).toBe(422)

    for (const headers of [
      { 'content-type': 'application/json' },
      { 'content-type': 'application/json', 'origin': 'https://evil.example' },
      { 'content-type': 'text/plain', origin },
      { 'content-type': 'application/json', origin, 'sec-fetch-site': 'cross-site' },
    ]) {
      expect((await fetch(url(path), {
        method: 'DELETE',
        headers: { ...headers, cookie: owner.cookie },
        body: '{"version":1}',
      })).status).toBe(403)
    }

    expect(await (await get(path, owner.cookie)).json()).toEqual(note)
    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email: owner.email, unverify: true },
    })
    expect((await post(path, { version: 1 }, owner.cookie, 'DELETE')).status).toBe(403)
  })

  it('rejects stale deletes and atomically resolves competing deletes, edits and archive transitions', async () => {
    const { cookie } = await account()
    const note = await (await post('/api/notes', { title: 'Original' }, cookie)).json()
    const path = `/api/notes/${note.id}`
    const edited = await (await post(path, { title: 'Newer', version: 1 }, cookie, 'PUT')).json()
    const stale = await post(path, { version: 1 }, cookie, 'DELETE')

    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({
      error: { code: 'NOTE_VERSION_CONFLICT' },
    })
    expect(await (await get(path, cookie)).json()).toEqual(edited)

    const deletions = await Promise.all([
      post(path, { version: 2 }, cookie, 'DELETE'),
      post(path, { version: 2 }, cookie, 'DELETE'),
    ])

    expect(deletions.map(response => response.status).sort()).toEqual([204, 404])
    expect(await deletions.find(response => response.status === 404)!.json()).toEqual({
      error: { code: 'NOTE_NOT_FOUND' },
    })

    for (const action of ['edit', 'archive', 'restore']) {
      let candidate = await (await post('/api/notes', { title: 'Race' }, cookie)).json()

      if (action === 'restore')
        candidate = await (await post(`/api/notes/${candidate.id}/archive`, { version: 1 }, cookie)).json()

      const target = `/api/notes/${candidate.id}`
      const results = await Promise.all([
        post(target, { version: candidate.version }, cookie, 'DELETE'),
        action === 'edit'
          ? post(target, { title: 'Changed', version: candidate.version }, cookie, 'PUT')
          : post(`${target}/${action}`, { version: candidate.version }, cookie),
      ])

      if (results[0]!.status === 204) {
        expect(results[1]!.status).toBe(404)
        expect((await get(target, cookie)).status).toBe(404)
      } else {
        expect(results[0]!.status).toBe(409)
        expect(results[1]!.status).toBe(200)
        expect(await (await get(target, cookie)).json()).toEqual(await results[1]!.json())
      }
    }
  })

  it('archives and restores without editing chronology, keeping archived notes read-only', async () => {
    const { cookie } = await account()
    const note = await (await post('/api/notes', { title: 'Retained', content: 'Reference' }, cookie)).json()
    const archive = await post(`/api/notes/${note.id}/archive`, { version: 1 }, cookie)

    expect(archive.status).toBe(200)

    const archived = { ...note, isArchived: true, version: 2 }

    expect(await archive.json()).toEqual(archived)
    expect(await (await get('/api/notes', cookie)).json()).toEqual({ notes: [] })
    expect(await (await get('/api/notes?archived=true', cookie)).json()).toEqual({
      notes: [archived],
    })
    expect(await (await get(`/api/notes/${note.id}`, cookie)).json()).toEqual(archived)
    expect((await post(`/api/notes/${note.id}`, { title: 'Forbidden', version: 2 }, cookie, 'PUT')).status).toBe(409)
    expect(await (await get(`/api/notes/${note.id}`, cookie)).json()).toEqual(archived)

    const restore = await post(`/api/notes/${note.id}/restore`, { version: 2 }, cookie)

    expect(restore.status).toBe(200)

    const restored = { ...note, version: 3 }

    expect(await restore.json()).toEqual(restored)
    expect(await (await get('/api/notes?archived=true', cookie)).json()).toEqual({ notes: [] })
    expect(await (await get('/api/notes', cookie)).json()).toEqual({
      notes: [restored],
    })
  })

  it('checks archive and restore ownership, versions, no-ops and competing transitions atomically', async () => {
    const { cookie } = await account()
    const other = await account()
    const note = await (await post('/api/notes', { title: 'Private' }, cookie)).json()
    const path = `/api/notes/${note.id}`

    for (const action of ['archive', 'restore']) {
      expect((await post(`${path}/${action}`, { version: 1 })).status).toBe(401)

      const hidden = await post(`${path}/${action}`, { version: 1 }, other.cookie)

      expect(hidden.status).toBe(404)
      expect(await hidden.json()).toEqual({
        error: { code: 'NOTE_NOT_FOUND' },
      })

      for (const version of [0, -1, 1.5, '1', null])
        expect((await post(`${path}/${action}`, { version }, cookie)).status).toBe(422)
      expect((await fetch(url(`${path}/${action}`), {
        method: 'POST',
        headers: { cookie, 'origin': 'https://evil.example', 'content-type': 'application/json' },
        body: '{"version":1}',
      })).status).toBe(403)
    }

    expect(await (await post(`${path}/restore`, { version: 1 }, cookie)).json()).toEqual(note)

    const races = await Promise.all([
      post(`${path}/archive`, { version: 1 }, cookie),
      post(path, { title: 'Competing edit', version: 1 }, cookie, 'PUT'),
    ])

    expect(races.map(response => response.status).sort()).toEqual([200, 409])

    const current = await (await get(path, cookie)).json()

    expect(current.version).toBe(2)

    for (const action of ['archive', 'restore']) {
      const stale = await post(`${path}/${action}`, { version: 1 }, cookie)

      expect(stale.status).toBe(409)
      expect(await stale.json()).toEqual({
        error: { code: 'NOTE_VERSION_CONFLICT' },
      })
    }

    const archived = await (await post(`${path}/archive`, { version: 2 }, cookie)).json()

    expect(await (await get('/api/notes?archived=true', other.cookie)).json()).toEqual({ notes: [] })
    expect((await get(path, other.cookie)).status).toBe(404)
    expect(await (await post(`${path}/archive`, { version: archived.version }, cookie)).json()).toEqual(archived)

    const restores = await Promise.all([
      post(`${path}/restore`, { version: archived.version }, cookie),
      post(`${path}/restore`, { version: archived.version }, cookie),
    ])

    expect(restores.map(response => response.status).sort()).toEqual([200, 409])
    await $fetch('/__test/note-state', {
      method: 'POST',
      body: { id: note.id, remove: true },
    })

    for (const action of ['archive', 'restore']) {
      const removed = await post(`${path}/${action}`, { version: 4 }, cookie)

      expect(removed.status).toBe(404)
      expect(await removed.json()).toEqual({
        error: { code: 'NOTE_NOT_FOUND' },
      })
    }

    expect(await (await get('/api/notes?archived=true', other.cookie)).json()).toEqual({ notes: [] })
  })

  it('restores notes to their chronological position and orders archive clock ties by descending ID', async () => {
    const { cookie } = await account()
    const saved = []

    for (const title of ['Older', 'Tie one', 'Tie two']) {
      const note = await (await post('/api/notes', { title }, cookie)).json()

      await $fetch('/__test/note-state', {
        method: 'POST',
        body: {
          id: note.id,
          lastEdited: title === 'Older'
            ? '2026-01-01T00:00:00Z'
            : '2026-02-01T00:00:00Z',
          isArchived: false,
        },
      })
      saved.push(note)
      await post(`/api/notes/${note.id}/archive`, { version: 1 }, cookie)
    }

    const order = [saved[1].id, saved[2].id].sort().reverse().concat(saved[0].id)

    expect((await (await get('/api/notes?archived=true', cookie)).json()).notes.map((note: { id: string }) => note.id)).toEqual(order)

    for (const note of saved)
      await post(`/api/notes/${note.id}/restore`, { version: 2 }, cookie)
    expect((await (await get('/api/notes', cookie)).json()).notes.map((note: { id: string }) => note.id)).toEqual(order)
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
    expect((await get('/api/notes?archived=true', owner.cookie)).status).toBe(403)

    for (const action of ['archive', 'restore'])
      expect((await post(`/api/notes/${note.id}/${action}`, { version: 1 }, owner.cookie)).status).toBe(403)
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
