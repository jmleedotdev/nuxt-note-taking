import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const origin = 'http://localhost:3000'
const password = 'Original1!'
const newPassword = 'Replacement2!'

let ip = 1

function post(path: string, body: object, cookie = '', address = `198.19.11.${ip++}`) {
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

function cookies(response: Response) {
  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
}

async function account(verified = true) {
  const email = `change-${randomUUID()}@example.test`

  expect((await post('/api/registration', { email, password })).status).toBe(202)

  if (verified) {
    const messages = await $fetch<{ to: string, text: string }[]>('/__test/mail')
    const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

    await fetch(url(link.pathname + link.search), { redirect: 'manual' })
  }

  return email
}

async function login(email: string, credential = password) {
  return post('/api/login', { email, password: credential })
}

function change(cookie: string, values = {}) {
  return post('/api/password/change', {
    currentPassword: password,
    newPassword,
    confirmation: newPassword,
    ...values,
  }, cookie)
}

async function requestReset(email: string) {
  expect((await post('/api/password/forgot', { email })).status).toBe(202)

  let token = ''

  await expect.poll(async () => {
    const messages = await $fetch<{ to: string, subject: string, text: string }[]>('/__test/mail')
    const message = messages.find(message => message.to === email && message.subject.includes('Reset'))

    token = message
      ? new URL(message.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!
      : ''

    return !!token
  }).toBe(true)

  return token
}

function configureRecovery(email: string, body: object) {
  return $fetch<{ waiters: number }>('/__test/recovery-state', {
    method: 'POST',
    body: { email, ...body },
  })
}

async function waitForCredentialWaiters(email: string, count: number) {
  await expect.poll(async () => (await configureRecovery(email, { waiters: true })).waiters).toBe(count)
}

function session(cookie: string) {
  return fetch(url('/api/session'), {
    headers: { cookie },
  })
}

describe('password change HTTP/PostgreSQL contract', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
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
            route: '/__test/recovery-state',
            handler: fileURLToPath(new URL('../fixtures/recovery-state.ts', import.meta.url)),
          },
        ],
      },
    },
  })

  it('keeps credentials and sessions intact after invalid current passwords or field validation', async () => {
    const email = await account()
    const cookie = cookies(await login(email))

    for (const values of [
      { currentPassword: 'Incorrect1!' },
      { newPassword: 'short', confirmation: 'short' },
      {
        newPassword: 'a'.repeat(129),
        confirmation: 'a'.repeat(129),
      },
      { newPassword: 'password with spaces', confirmation: 'password with spaces' },
      {
        newPassword: 'é'.repeat(15),
        confirmation: 'é'.repeat(15),
      },
      {
        newPassword: 'a'.repeat(8),
        confirmation: 'b'.repeat(8),
      },
      { currentPassword: ` ${password}` },
    ]) {
      const response = await change(cookie, values)

      expect(response.status).toBe('currentPassword' in values && values.currentPassword === 'Incorrect1!'
        ? 400
        : 422)

      const body = await response.json()

      expect(body.error.code).toBe(response.status === 400
        ? 'INVALID_CURRENT_PASSWORD'
        : 'VALIDATION')
      expect(JSON.stringify(body)).not.toContain('Incorrect1!')
      expect(response.headers.get('set-cookie')).toBeNull()
      expect((await session(cookie)).status).toBe(200)
    }

    expect((await login(email)).status).toBe(200)
  })

  it('requires authoritative verified authentication, safe origin and JSON, and leaves underlying library routes unreachable', async () => {
    expect((await change('')).status).toBe(401)

    const email = await account()
    const cookie = cookies(await login(email))

    for (const headers of [
      { origin: 'https://hostile.test' },
      { 'sec-fetch-site': 'cross-site' },
      { 'content-type': 'text/plain' },
      { origin: '' },
    ]) {
      const response = await fetch(url('/api/password/change'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          cookie,
          ...headers,
        },
        body: JSON.stringify({ currentPassword: password, newPassword, confirmation: newPassword }),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({
        error: { code: 'FORBIDDEN_ORIGIN' },
      })
    }

    for (const [body, status, code] of [
      ['{', 400, 'INVALID_REQUEST'],
      [
        JSON.stringify({
          extra: 'x'.repeat(4096),
        }),
        413,
        'REQUEST_TOO_LARGE',
      ],
    ] as const) {
      const response = await fetch(url('/api/password/change'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, cookie },
        body,
      })

      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({
        error: { code },
      })
    }

    for (const path of ['/api/auth/change-password', '/api/auth/set-password'])
      expect((await post(path, { currentPassword: password, newPassword, revokeOtherSessions: false }, cookie)).status).toBe(404)

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, unverify: true },
    })

    const unverified = await change(cookie)

    expect(unverified.status).toBe(403)
    expect(await unverified.json()).toEqual({
      error: { code: 'EMAIL_NOT_VERIFIED' },
    })
  })

  it('rolls back the credential and reset authorization when all-session revocation fails', async () => {
    const email = await account()
    const cookie = cookies(await login(email))
    const token = await requestReset(email)

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, failLogout: true },
    })

    try {
      const response = await change(cookie)

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: { code: 'AUTH_UNAVAILABLE' },
      })
      expect(response.headers.get('set-cookie')).toBeNull()
      expect((await session(cookie)).status).toBe(200)
      expect((await login(email)).status).toBe(200)
      expect((await login(email, newPassword)).status).toBe(401)
    } finally {
      await $fetch('/__test/auth-state', {
        method: 'POST',
        body: { email, failLogout: false },
      })
    }

    expect((await post('/api/password/reset', { token, newPassword, confirmation: newPassword })).status).toBe(200)
    expect((await session(cookie)).status).toBe(401)
  })

  it('serializes old-password login on either side of a change and rechecks queued sessions', async () => {
    for (const first of ['login', 'change'] as const) {
      const email = await account()
      const cookie = cookies(await login(email))

      await configureRecovery(email, { gate: true })

      const start = () => first === 'login'
        ? login(email)
        : change(cookie)
      const one = start()

      let two: Promise<Response> | undefined

      try {
        await waitForCredentialWaiters(email, 1)
        two = first === 'login'
          ? change(cookie)
          : login(email)
        await waitForCredentialWaiters(email, 2)
      } finally {
        await configureRecovery(email, { gate: false })
      }

      const [a, b] = await Promise.all([one, two!])
      const changed = first === 'change'
        ? a
        : b
      const signedIn = first === 'login'
        ? a
        : b

      expect(changed.status).toBe(200)
      expect(signedIn.status).toBe(first === 'login'
        ? 200
        : 401)
      expect((await session(cookie)).status).toBe(401)

      if (signedIn.ok)
        expect((await session(cookies(signedIn))).status).toBe(401)
      expect((await login(email, newPassword)).status).toBe(200)
    }
  })

  it('does not authorize a queued change after logout or another password change', async () => {
    for (const preceding of ['logout', 'change'] as const) {
      const email = await account()
      const cookie = cookies(await login(email))

      await configureRecovery(email, { gate: true })

      const one = change(cookie)

      let two: Promise<Response> | undefined

      try {
        await waitForCredentialWaiters(email, 1)

        if (preceding === 'logout') {
          expect((await post('/api/logout', {}, cookie)).status).toBe(200)
        } else {
          two = change(cookie, { newPassword: 'Another3!', confirmation: 'Another3!' })
          await waitForCredentialWaiters(email, 2)
        }
      } finally {
        await configureRecovery(email, { gate: false })
      }

      const response = await one

      expect(response.status).toBe(preceding === 'logout'
        ? 401
        : 200)

      if (two) {
        const rejected = await two

        expect(rejected.status).toBe(401)
        expect(await rejected.json()).toEqual({
          error: { code: 'UNAUTHENTICATED' },
        })
      }

      expect((await login(email, preceding === 'logout'
        ? password
        : newPassword)).status).toBe(200)
    }
  })

  it('rechecks verification and both session expiry boundaries after waiting for the credential lock', async () => {
    for (const precondition of [
      { unverify: true },
      { expire: true },
      { ageSeconds: 604800 },
    ]) {
      const email = await account()
      const cookie = cookies(await login(email))

      await configureRecovery(email, { gate: true })

      const pending = change(cookie)

      try {
        await waitForCredentialWaiters(email, 1)
        await $fetch('/__test/auth-state', {
          method: 'POST',
          body: { email, ...precondition },
        })
      } finally {
        await configureRecovery(email, { gate: false })
      }

      const response = await pending

      expect(response.status).toBe('unverify' in precondition
        ? 403
        : 401)
      expect(await response.json()).toEqual({
        error: {
          code: 'unverify' in precondition
            ? 'EMAIL_NOT_VERIFIED'
            : 'UNAUTHENTICATED',
        },
      })
      expect((await login(email)).status).toBe('unverify' in precondition
        ? 403
        : 200)
      expect((await login(email, newPassword)).status).toBe(401)
    }
  })

  it('enforces shared per-account and IP change budgets without revoking sessions', async () => {
    const email = await account()
    const cookie = cookies(await login(email))
    const values = { currentPassword: 'Incorrect1!', newPassword, confirmation: newPassword }

    for (let attempt = 0; attempt < 5; attempt++)
      expect((await post('/api/password/change', values, cookie)).status).toBe(400)

    const denied = await change(cookie)

    expect(denied.status).toBe(429)
    expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await denied.json()).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    })
    expect((await session(cookie)).status).toBe(200)

    // Different accounts share one trusted-proxy IP budget, not a process-local counter.
    const address = '198.19.12.1'

    for (let owner = 0; owner < 5; owner++) {
      const other = await account()
      const otherCookie = cookies(await login(other))

      for (let attempt = 0; attempt < (owner === 4
        ? 1
        : 5); attempt++) {
        expect((await post('/api/password/change', values, otherCookie, address)).status).toBe(owner === 4
          ? 429
          : 400)
      }

      expect((await session(otherCookie)).status).toBe(200)
    }
  })

  it('accepts exact 8 and 128 character passwords without composition rules', async () => {
    for (const credential of [
      'a'.repeat(8),
      '!'.repeat(128),
    ]) {
      const email = await account()
      const cookie = cookies(await login(email))

      expect((await change(cookie, { newPassword: credential, confirmation: credential })).status).toBe(200)
      expect((await login(email, credential)).status).toBe(200)
    }
  })

  it('changes the credential, revokes every session without replacement, and rejects copied cookies on HTTP and SSR paths', async () => {
    const email = await account()
    const first = cookies(await login(email))
    const second = cookies(await login(email))
    const token = await requestReset(email)
    const response = await change(first)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'password-changed' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.getSetCookie()).toEqual(expect.arrayContaining([
      expect.stringMatching(/session_token=;.*Max-Age=0/i),
    ]))
    expect(response.headers.getSetCookie().every(value => value.includes('Max-Age=0'))).toBe(true)

    for (const cookie of [
      first,
      second,
      cookies(response),
    ]) {
      expect((await session(cookie)).status).toBe(401)
      expect((await fetch(url('/api/notes'), {
        headers: { cookie },
      })).status).toBe(401)

      const ssr = await fetch(url('/?panel=settings&setting=password'), {
        headers: { cookie },
        redirect: 'manual',
      })

      expect(ssr.headers.get('location')).toBe('/login')
      expect(ssr.headers.get('cache-control')).toBe('no-store')
    }

    expect((await post('/api/password/reset', { token, newPassword: 'Another3!', confirmation: 'Another3!' })).status).toBe(400)
    expect((await login(email)).status).toBe(401)
    expect((await login(email, newPassword)).status).toBe(200)
  })
})
