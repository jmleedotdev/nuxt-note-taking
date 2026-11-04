import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const origin = 'http://localhost:3000'

let ip = 120

function requestJSON(path: string, body: unknown, cookie = '', method = 'POST', expectedAccount = '') {
  const address = ip++

  return fetch(url(path), {
    method,
    headers: {
      'content-type': 'application/json',
      origin,
      cookie,
      'x-expected-account-id': expectedAccount,
      'x-real-ip': `198.19.${Math.floor(address / 256)}.${address % 256}`,
    },
    body: JSON.stringify(body),
  })
}

async function account() {
  const email = `preferences-${randomUUID()}@example.test`
  const password = 'Abcdef1!'

  expect((await requestJSON('/api/registration', { email, password })).status).toBe(202)

  const messages = await $fetch<{ to: string, text: string }[]>('/__test/mail')
  const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

  await fetch(url(link.pathname + link.search), { redirect: 'manual' })

  const response = await requestJSON('/api/login', { email, password })

  expect(response.status).toBe(200)

  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const session = await (await get('/api/session', cookie)).json()

  return { email, cookie, id: session.user.id as string }
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

  it('rejects an expected account that differs from the cookie session without reading or updating its preferences', async () => {
    const first = await account()
    const second = await account()
    const firstSession = await (await get('/api/session', first.cookie)).json()
    const headers = {
      'cookie': second.cookie,
      'origin': origin,
      'content-type': 'application/json',
      'x-expected-account-id': firstSession.user.id,
    }

    for (const method of ['GET', 'PUT']) {
      const response = await fetch(url('/api/preferences'), {
        method,
        headers,
        ...(method === 'PUT'
          ? {
              body: JSON.stringify({ theme: 'dark', font: 'source-code-pro' }),
            }
          : {}),
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        error: { code: 'ACCOUNT_CHANGED' },
      })
    }

    const missing = await requestJSON('/api/preferences', { theme: 'dark', font: 'inter' }, second.cookie, 'PUT')

    expect(missing.status).toBe(409)
    expect(await (await get('/api/preferences', second.cookie)).json()).toEqual({ theme: 'system', font: 'inter' })
  })

  it('guards reads and writes and rejects invalid or owner-supplied fields without changing saved preferences', async () => {
    const { cookie, email, id } = await account()
    const input = { theme: 'light', font: 'source-code-pro' }

    expect((await get('/api/preferences', '')).status).toBe(401)
    expect((await requestJSON('/api/preferences', input, '', 'PUT')).status).toBe(401)

    for (const invalid of [
      {},
      { ...input, theme: 'sepia' },
      { ...input, font: 'comic-sans' },
      { ...input, ownerId: 'another-user' },
      { ...input, theme: null },
    ]) {
      const response = await requestJSON('/api/preferences', invalid, cookie, 'PUT', id)

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
    expect((await requestJSON('/api/preferences', input, cookie, 'PUT', id)).status).toBe(403)
  })

  it('returns System and Inter defaults and persists owner-scoped appearance across sessions', async () => {
    const first = await account()
    const getPreferences = (cookie: string) => get('/api/preferences', cookie)
    const defaults = await getPreferences(first.cookie)

    expect(defaults.status).toBe(200)
    expect(defaults.headers.get('cache-control')).toBe('no-store')
    expect(await defaults.json()).toEqual({ theme: 'system', font: 'inter' })

    const saved = await requestJSON('/api/preferences', { theme: 'dark', font: 'noto-serif' }, first.cookie, 'PUT', first.id)

    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ theme: 'dark', font: 'noto-serif' })

    const login = await requestJSON('/api/login', { email: first.email, password: 'Abcdef1!' })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')

    expect(await (await getPreferences(cookie)).json()).toEqual({ theme: 'dark', font: 'noto-serif' })

    const second = await account()

    expect(await (await getPreferences(second.cookie)).json()).toEqual({ theme: 'system', font: 'inter' })
    expect((await requestJSON('/api/preferences', { theme: 'light', font: 'source-code-pro' }, second.cookie, 'PUT', second.id)).status).toBe(200)
    expect(await (await getPreferences(first.cookie)).json()).toEqual({ theme: 'dark', font: 'noto-serif' })
  })
})
