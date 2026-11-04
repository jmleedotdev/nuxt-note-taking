import { Buffer } from 'node:buffer'
import { createHmac, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const origin = 'http://localhost:3000'
const password = 'Abcdef1!'

let ip = 60

function post(path: string, body: object, cookie = '', address = `192.0.2.${ip++}`) {
  return fetch(url(path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      cookie,
      'x-real-ip': address,
    },
    body: JSON.stringify(body),
  })
}

async function account() {
  const email = `auth-${randomUUID()}@example.test`

  expect((await post('/api/registration', { email, password })).status).toBe(202)

  const messages = await $fetch<{ to: string, text: string }[]>('/__test/mail')
  const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

  return { email, link: link.pathname + link.search }
}

function cookies(response: Response) {
  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
}

describe('authentication HTTP contract', async () => {
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

  it('returns application-owned unauthenticated errors without a library or framework envelope', async () => {
    const response = await fetch(url('/api/session'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  it('treats invalid/expired links as recoverable and repeated verification as harmless success', async () => {
    const { email, link } = await account()
    const token = new URL(link, origin).searchParams.get('token')!
    const [header, payload] = token.split('.')
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString())
    const expiredPayload = Buffer.from(JSON.stringify({ ...claims, iat: 1, exp: 2 })).toString('base64url')
    const input = `${header}.${expiredPayload}`
    const signature = createHmac('sha256', process.env.APP_AUTH_SECRET!).update(input).digest('base64url')

    for (const invalid of ['broken', `${input}.${signature}`]) {
      const response = await fetch(url(`/api/registration/verify?token=${invalid}&callbackURL=https://evil.example`), { redirect: 'manual' })

      expect(response.headers.get('location')).toBe('/check-email?invalid=1')
      expect(response.headers.get('set-cookie')).toBeNull()
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(url(`${link}&callbackURL=https://evil.example`), { redirect: 'manual' })

      expect(response.headers.get('location')).toBe('/login?verified=1')
      expect(response.headers.get('set-cookie')).toBeNull()
    }

    expect((await post('/api/login', { email, password })).status).toBe(200)
  })

  it('atomically shares login email limits across concurrent requests and trusted IPs', async () => {
    const email = `limit-${randomUUID()}@example.test`
    const results = await Promise.all(Array.from({ length: 8 }, () => post('/api/login', { email, password })))

    expect(results.filter(response => response.status === 401)).toHaveLength(5)

    const denied = results.filter(response => response.status === 429)

    expect(denied).toHaveLength(3)
    expect(Number(denied[0]!.headers.get('retry-after'))).toBeGreaterThan(850)
    expect(await denied[0]!.json()).toEqual({
      error: { code: 'RATE_LIMITED' },
      retryAfter: expect.any(Number),
    })
  })

  it('limits login by IP despite spoofed forwarding headers and varying emails', async () => {
    const statuses = []

    for (let index = 0; index < 21; index++) {
      statuses.push((await post('/api/login', { email: `ip-${index}@example.test`, password }, '', '198.51.100.99')).status)
    }

    expect(statuses.slice(0, 20)).toEqual(Array.from({ length: 20 }).fill(401))
    expect(statuses[20]).toBe(429)
  })

  it('uses identical invalid-credential errors for unknown accounts and wrong passwords', async () => {
    const { email, link } = await account()

    await fetch(url(link), { redirect: 'manual' })

    for (const candidate of [email, 'missing@example.test']) {
      const response = await post('/api/login', { email: candidate, password: 'WrongPassword!' })

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        error: { code: 'INVALID_CREDENTIALS' },
      })
      expect(response.headers.get('set-cookie')).toBeNull()
    }
  })

  it.each([
    'short',
    'a'.repeat(129),
    'abcdefgh ',
    'abcdefghé',
    'abcdefgh\t',
  ])('rejects invalid password input at login: %s', async (invalid) => {
    expect((await post('/api/login', { email: 'input@example.test', password: invalid })).status).toBe(422)
  })

  it.each([
    'a'.repeat(128),
    '12345678',
    '!@#$%^&*',
  ])('accepts the shared password policy through real login', async (credential) => {
    const email = `credential-${randomUUID()}@example.test`

    expect((await post('/api/registration', { email, password: credential })).status).toBe(202)

    const messages = await $fetch<{ to: string, text: string }[]>('/__test/mail')
    const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

    await fetch(url(link.pathname + link.search), { redirect: 'manual' })
    expect((await post('/api/login', { email, password: credential })).status).toBe(200)
  })

  it('resend shares signup cooldown and account limits without disclosing unknown addresses', async () => {
    const { email } = await account()
    const blocked = await post('/api/registration/resend', {
      email: email.toUpperCase(),
    })

    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)

    const unknown = await post('/api/registration/resend', { email: `unknown-${randomUUID()}@example.test` })

    expect(unknown.status).toBe(202)
    expect(await unknown.json()).toEqual({ status: 'check-email', resendAfter: 30 })
  })

  it('rejects login/logout CSRF attempts and keeps library routes unreachable', async () => {
    const { email, link } = await account()

    await fetch(url(link), { redirect: 'manual' })

    const cookie = cookies(await post('/api/login', { email, password }))

    for (const path of ['/api/login', '/api/logout']) {
      for (const headers of [
        { 'content-type': 'application/json' },
        { 'content-type': 'application/json', 'origin': 'https://evil.example' },
        { 'content-type': 'text/plain', origin },
        { 'content-type': 'application/json', origin, 'sec-fetch-site': 'cross-site' },
      ]) {
        const response = await fetch(url(path), {
          method: 'POST',
          headers: { ...headers, cookie },
          body: JSON.stringify({ email, password }),
        })

        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({
          error: { code: 'FORBIDDEN_ORIGIN' },
        })
      }
    }

    expect((await fetch(url('/api/session'), {
      headers: { cookie },
    })).status).toBe(200)

    for (const path of [
      '/api/auth/sign-in/email',
      '/api/auth/sign-out',
      '/api/auth/get-session',
      '/api/auth/verify-email',
      '/api/auth/revoke-sessions',
    ]) {
      expect((await fetch(url(path), {
        method: path.includes('get-session')
          ? 'GET'
          : 'POST',
      })).status).toBe(404)
    }
  })

  it('protects direct SSR navigation and rechecks verified state from the database', async () => {
    const anonymous = await fetch(url('/'), { redirect: 'manual' })

    expect(anonymous.status, await anonymous.text()).toBe(302)
    expect(anonymous.headers.get('location')).toBe('/login')

    const { email, link } = await account()

    await fetch(url(link), { redirect: 'manual' })

    const cookie = cookies(await post('/api/login', { email, password }))
    const shell = await fetch(url('/'), {
      headers: { cookie },
      redirect: 'manual',
    })

    expect(shell.status).toBe(200)
    expect(await shell.text()).toContain('All Notes')
    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, unverify: true },
    })
    expect((await fetch(url('/api/session'), {
      headers: { cookie },
    })).status).toBe(403)

    const denied = await fetch(url('/'), {
      headers: { cookie },
      redirect: 'manual',
    })

    expect(denied.headers.get('location')).toBe('/check-email?required=1')

    const recovery = await fetch(url(denied.headers.get('location')!), {
      headers: { cookie },
    })
    const html = await recovery.text()

    expect(html).toContain('Your email needs verification before you can access your notes.')
    expect(html).toContain('Back to login')
    expect(html).not.toContain('This link is invalid or has expired.')
  })

  it('enforces a hard seven-day session lifetime even if a stored expiry is longer', async () => {
    const { email, link } = await account()

    await fetch(url(link), { redirect: 'manual' })

    const cookie = cookies(await post('/api/login', { email, password }))
    const session = () => fetch(url('/api/session'), {
      headers: { cookie },
    })
    const before = await (await session()).json()

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, ageSeconds: 604740 },
    })
    expect((await session()).status).toBe(200)
    expect((await (await session()).json()).expiresAt).toBe(before.expiresAt)
    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, ageSeconds: 604801 },
    })

    const expired = await session()

    expect(expired.status).toBe(401)
    expect(expired.headers.get('set-cookie')).toMatch(/Max-Age=0/i)
  })

  it('propagates expired-session cookie clearing through SSR redirects', async () => {
    const { email, link } = await account()

    await fetch(url(link), { redirect: 'manual' })

    const cookie = cookies(await post('/api/login', { email, password }))

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, expire: true },
    })

    const response = await fetch(url('/'), {
      headers: { cookie },
      redirect: 'manual',
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/login')
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/i)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('does not claim logout or clear cookies when PostgreSQL cannot revoke the session', async () => {
    const { email, link } = await account()

    await fetch(url(link), { redirect: 'manual' })

    const cookie = cookies(await post('/api/login', { email, password }))

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, failLogout: true },
    })

    try {
      const failed = await post('/api/logout', {}, cookie)

      expect(failed.status).toBe(503)
      expect(await failed.json()).toEqual({
        error: { code: 'AUTH_UNAVAILABLE' },
      })
      expect(failed.headers.get('set-cookie')).toBeNull()
      expect((await fetch(url('/api/session'), {
        headers: { cookie },
      })).status).toBe(200)
    } finally {
      await $fetch('/__test/auth-state', {
        method: 'POST',
        body: { email, failLogout: false },
      })
    }

    const retried = await post('/api/logout', {}, cookie)

    expect(retried.status).toBe(200)
    expect((await fetch(url('/api/session'), {
      headers: { cookie },
    })).status).toBe(401)
  })

  it('logout revokes a copied cookie, clears the browser cookie, and preserves another device', async () => {
    const { email, link } = await account()

    await fetch(url(link), { redirect: 'manual' })

    const first = cookies(await post('/api/login', { email, password }))
    const second = cookies(await post('/api/login', { email, password }))
    const logout = await post('/api/logout', {}, first)

    expect(logout.status).toBe(200)
    expect(await logout.json()).toEqual({ status: 'signed-out' })
    expect(logout.headers.get('set-cookie')).toMatch(/Max-Age=0/i)
    expect((await fetch(url('/api/session'), {
      headers: { cookie: first },
    })).status).toBe(401)
    expect((await fetch(url('/api/session'), {
      headers: { cookie: second },
    })).status).toBe(200)
  })

  it('verifies without signing in, then issues an application-owned session through login', async () => {
    const { email, link } = await account()
    const unverified = await post('/api/login', { email, password })

    expect(unverified.status).toBe(403)
    expect(await unverified.json()).toEqual({
      error: { code: 'EMAIL_NOT_VERIFIED' },
    })
    expect(unverified.headers.get('set-cookie')).toBeNull()

    const verified = await fetch(url(link), { redirect: 'manual' })

    expect(verified.headers.get('location')).toBe('/login?verified=1')
    expect(verified.headers.get('set-cookie')).toBeNull()

    const login = await post('/api/login', {
      email: email.toUpperCase(),
      password,
      callbackURL: 'https://evil.example',
    })

    expect(login.status).toBe(200)
    expect(await login.json()).toEqual({ status: 'signed-in' })
    expect(login.headers.get('location')).toBeNull()
    expect(login.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(login.headers.get('set-cookie')).toMatch(/SameSite=Lax/i)
    expect(login.headers.get('set-cookie')).toMatch(/Max-Age=604800/i)

    const session = await fetch(url('/api/session'), {
      headers: {
        cookie: cookies(login),
      },
    })

    expect(session.status).toBe(200)
    expect(await session.json()).toEqual({
      user: {
        id: expect.any(String),
        email,
      },
      expiresAt: expect.any(String),
    })
    expect(session.headers.get('cache-control')).toBe('no-store')
  })
})
