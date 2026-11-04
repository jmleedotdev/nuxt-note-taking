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
  const email = `preferences-${randomUUID()}@example.test`
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

describe('account appearance HTTP contract', async () => {
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
        ],
      },
    },
  })

  it('guards reads and writes and rejects invalid or owner-supplied fields without changing saved preferences', async () => {
    const { cookie, email } = await account()
    const input = { theme: 'light', font: 'source-code-pro' }

    expect((await get('/api/preferences', '')).status).toBe(401)
    expect((await post('/api/preferences', input, '', 'PUT')).status).toBe(401)

    for (const invalid of [
      {},
      { ...input, theme: 'sepia' },
      { ...input, font: 'comic-sans' },
      { ...input, ownerId: 'another-user' },
      { ...input, theme: null },
    ]) {
      const response = await post('/api/preferences', invalid, cookie, 'PUT')

      expect(response.status).toBe(422)
      expect((await response.json()).error.code).toBe('VALIDATION')
    }

    const crossOrigin = await fetch(url('/api/preferences'), {
      method: 'PUT',
      headers: { cookie, 'origin': 'https://untrusted.example', 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })

    expect(crossOrigin.status).toBe(403)
    expect(await crossOrigin.json()).toEqual({
      error: { code: 'FORBIDDEN_ORIGIN' },
    })
    expect(await (await get('/api/preferences', cookie)).json()).toEqual({ theme: 'system', font: 'inter' })

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, unverify: true },
    })
    expect((await get('/api/preferences', cookie)).status).toBe(403)
    expect((await post('/api/preferences', input, cookie, 'PUT')).status).toBe(403)
  })

  it('returns System and Inter defaults and persists owner-scoped appearance across sessions', async () => {
    const first = await account()
    const getPreferences = (cookie: string) => get('/api/preferences', cookie)
    const defaults = await getPreferences(first.cookie)

    expect(defaults.status).toBe(200)
    expect(defaults.headers.get('cache-control')).toBe('no-store')
    expect(await defaults.json()).toEqual({ theme: 'system', font: 'inter' })

    const saved = await post('/api/preferences', { theme: 'dark', font: 'noto-serif' }, first.cookie, 'PUT')

    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ theme: 'dark', font: 'noto-serif' })

    const login = await post('/api/login', { email: first.email, password: 'Abcdef1!' })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')

    expect(await (await getPreferences(cookie)).json()).toEqual({ theme: 'dark', font: 'noto-serif' })

    const second = await account()

    expect(await (await getPreferences(second.cookie)).json()).toEqual({ theme: 'system', font: 'inter' })
    expect((await post('/api/preferences', { theme: 'light', font: 'source-code-pro' }, second.cookie, 'PUT')).status).toBe(200)
    expect(await (await getPreferences(first.cookie)).json()).toEqual({ theme: 'dark', font: 'noto-serif' })
  })
})
