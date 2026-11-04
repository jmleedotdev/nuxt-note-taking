import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('hTTPS session cookies', async () => {
  const origin = 'https://notes.example.test'

  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    env: { APP_URL: origin, MAILTRAP_URL: '' },
    nuxtConfig: {
      nitro: {
        handlers: [
          {
            route: '/__test/mail',
            handler: fileURLToPath(new URL('../fixtures/mail.ts', import.meta.url)),
          },
        ],
      },
    },
  })

  it('sets Secure cookies with a seven-day maximum and clears them on logout', async () => {
    const email = `secure-${randomUUID()}@example.test`
    const password = 'Abcdef1!'
    const post = (path: string, cookie = '') => fetch(url(path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        cookie,
        'x-real-ip': '203.0.113.200',
      },
      body: JSON.stringify({ email, password }),
    })

    expect((await post('/api/registration')).status).toBe(202)

    const messages = await $fetch<{ to: string, text: string }[]>('/__test/mail')
    const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

    expect(link.origin).toBe(origin)
    await fetch(url(link.pathname + link.search), { redirect: 'manual' })

    const login = await post('/api/login')

    expect(login.status).toBe(200)

    const values = login.headers.getSetCookie()

    expect(values.some(value => value.startsWith('__Secure-better-auth.session_token=') && /; Secure/i.test(value) && /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value) && /Max-Age=604800/i.test(value))).toBe(true)

    const cookie = values.map(value => value.split(';')[0]).join('; ')
    const session = await fetch(url('/api/session'), {
      headers: { cookie },
    })

    expect(session.status).toBe(200)

    const logout = await post('/api/logout', cookie)

    expect(logout.status).toBe(200)
    expect(logout.headers.getSetCookie().some(value => value.startsWith('__Secure-better-auth.session_token=') && /Max-Age=0/i.test(value) && /; Secure/i.test(value))).toBe(true)
    expect((await fetch(url('/api/session'), {
      headers: { cookie },
    })).status).toBe(401)
  })
})
