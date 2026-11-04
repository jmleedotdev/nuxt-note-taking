import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const origin = 'http://localhost:3000'
const password = 'Original1!'
const newPassword = 'Replacement2!'

let ip = 1

function post(path: string, body: object, cookie = '', address = `198.18.0.${ip++}`) {
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

async function mailLink(email: string, subject: string) {
  let link: URL | undefined

  await expect.poll(async () => {
    const messages = await $fetch<{ to: string, subject: string, text: string }[]>('/__test/mail')
    const message = messages.filter(message => message.to === email && message.subject.includes(subject)).at(-1)

    link = message
      ? new URL(message.text.match(/https?:\/\/\S+/)![0])
      : undefined

    return Boolean(link)
  }).toBe(true)

  return link!
}

async function account() {
  const email = `reset-${randomUUID()}@example.test`

  expect((await post('/api/registration', { email, password })).status).toBe(202)

  const verification = await mailLink(email, 'Verify')

  await fetch(url(verification.pathname + verification.search), { redirect: 'manual' })

  return email
}

async function requestReset(email: string) {
  expect((await post('/api/password/forgot', { email })).status).toBe(202)

  return (await mailLink(email, 'Reset')).searchParams.get('token')!
}

function redeem(token: string, cookie = '', credential = newPassword) {
  return post('/api/password/reset', { token, newPassword: credential, confirmation: credential }, cookie)
}

function session(cookie: string) {
  return fetch(url('/api/session'), {
    headers: { cookie },
  })
}

describe('password recovery HTTP/PostgreSQL contract', async () => {
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

  it('gives known and unknown addresses identical responses despite slow or failed mail', async () => {
    const email = await account()

    await $fetch('/__test/mail', {
      method: 'POST',
      body: { delay: 1200, fail: true },
    })

    try {
      for (const candidate of [
        email.toUpperCase(),
        `absent-${randomUUID()}@example.test`,
      ]) {
        const started = performance.now()
        const response = await post('/api/password/forgot', { email: candidate })

        expect(response.status).toBe(202)
        expect(await response.json()).toEqual({ status: 'check-email', resendAfter: 30 })
        expect(response.headers.get('set-cookie')).toBeNull()
        expect(performance.now() - started).toBeLessThan(900)
      }

      await new Promise(resolve => setTimeout(resolve, 1300))
    } finally {
      await $fetch('/__test/mail', {
        method: 'POST',
        body: { fail: false, delay: 0 },
      })
    }
  })

  it('invalidates an older authorization even when submission of the newest mail fails', async () => {
    const email = await account()
    const old = await requestReset(email)

    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, cooldown: true },
    })
    await $fetch('/__test/mail', {
      method: 'POST',
      body: { fail: true },
    })

    try {
      expect((await post('/api/password/forgot', { email })).status).toBe(202)
      expect((await redeem(old)).status).toBe(400)
      expect((await post('/api/login', { email, password })).status).toBe(200)
    } finally {
      await $fetch('/__test/mail', {
        method: 'POST',
        body: { fail: false },
      })
    }
  })

  it('uses only the newest link, once, including concurrent redemption', async () => {
    const email = await account()
    const old = await requestReset(email)

    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, cooldown: true },
    })
    expect((await post('/api/password/forgot', { email })).status).toBe(202)

    let newest = old

    await expect.poll(async () => {
      newest = (await mailLink(email, 'Reset')).searchParams.get('token')!

      return newest !== old
    }).toBe(true)
    expect((await redeem(old)).status).toBe(400)

    const results = await Promise.all([
      redeem(newest),
      redeem(newest),
    ])

    expect(results.map(response => response.status).sort()).toEqual([200, 400])
    expect(await results.find(response => response.status === 400)!.json()).toEqual({
      error: { code: 'INVALID_RESET_LINK' },
    })
  })

  it('serializes concurrent issuance and leaves exactly the latest authorization usable', async () => {
    const email = await account()
    const old = await requestReset(email)

    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, cooldown: true, gate: true },
    })

    const first = post('/api/password/forgot', { email })

    let second: Promise<Response> | undefined

    try {
      await expect.poll(async () => (await $fetch<{ waiters: number }>('/__test/recovery-state', {
        method: 'POST',
        body: { email, waiters: true },
      })).waiters).toBe(1)
      await $fetch('/__test/recovery-state', {
        method: 'POST',
        body: { email, cooldown: true },
      })
      second = post('/api/password/forgot', { email })
      await expect.poll(async () => (await $fetch<{ waiters: number }>('/__test/recovery-state', {
        method: 'POST',
        body: { email, waiters: true },
      })).waiters).toBe(2)
    } finally {
      await $fetch('/__test/recovery-state', {
        method: 'POST',
        body: { email, gate: false },
      })
    }

    expect((await first).status).toBe(202)
    expect((await second!).status).toBe(202)
    expect((await redeem(old)).status).toBe(400)

    const latest = (await mailLink(email, 'Reset')).searchParams.get('token')!

    expect((await redeem(latest)).status).toBe(200)
  })

  it('does not let redemption delete an authorization issued concurrently', async () => {
    const email = await account()
    const old = await requestReset(email)

    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, cooldown: true },
    })

    const [issuance, redemption] = await Promise.all([
      post('/api/password/forgot', { email }),
      redeem(old),
    ])

    expect(issuance.status).toBe(202)
    expect([200, 400]).toContain(redemption.status)

    let latest = old

    await expect.poll(async () => {
      latest = (await mailLink(email, 'Reset')).searchParams.get('token')!

      return latest !== old
    }).toBe(true)
    expect((await redeem(latest)).status).toBe(200)
  })

  it.each([1790, 1800])('enforces the issued thirty-minute lifetime at age %s seconds', async (ageResetSeconds) => {
    const email = await account()
    const token = await requestReset(email)

    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, ageResetSeconds },
    })
    expect((await redeem(token)).status).toBe(ageResetSeconds === 1790
      ? 200
      : 400)
  })

  it('rechecks expiry after waiting for the credential lock', async () => {
    const email = await account()
    const token = await requestReset(email)

    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, gate: true },
    })

    const redemption = redeem(token)

    try {
      await expect.poll(async () => (await $fetch<{ waiters: number }>('/__test/recovery-state', {
        method: 'POST',
        body: { email, waiters: true },
      })).waiters).toBe(1)
      await $fetch('/__test/recovery-state', {
        method: 'POST',
        body: { email, expiresIn: 0 },
      })
    } finally {
      await $fetch('/__test/recovery-state', {
        method: 'POST',
        body: { email, gate: false },
      })
    }

    expect((await redemption).status).toBe(400)
  })

  it.each([
    'a'.repeat(8),
    'z'.repeat(128),
    '!@#$%^&*',
  ])('accepts the established replacement policy at exact boundaries', async (credential) => {
    const email = await account()
    const token = await requestReset(email)

    expect((await redeem(token, '', credential)).status).toBe(200)
    expect((await post('/api/login', { email, password: credential })).status).toBe(200)
  })

  it('rejects expiration at the boundary without changing the credential or session', async () => {
    const email = await account()
    const cookie = cookies(await post('/api/login', { email, password }))
    const token = await requestReset(email)

    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, expiresIn: 0 },
    })
    expect((await redeem(token)).status).toBe(400)
    expect((await session(cookie)).status).toBe(200)
    expect((await post('/api/login', { email, password })).status).toBe(200)
    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, expiresIn: 60 },
    })
    expect((await redeem(token)).status).toBe(200)
  })

  it('shares the five/hour reset account budget across token rotation and IPs', async () => {
    const email = await account()
    const cookie = cookies(await post('/api/login', { email, password }))
    const token = await requestReset(email)

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, failLogout: true },
    })

    try {
      const failures = await Promise.all(Array.from({ length: 5 }, () => redeem(token, cookie)))

      expect(failures.map(response => response.status)).toEqual([503, 503, 503, 503, 503])
    } finally {
      await $fetch('/__test/auth-state', {
        method: 'POST',
        body: { email, failLogout: false },
      })
    }

    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, cooldown: true },
    })
    expect((await post('/api/password/forgot', { email })).status).toBe(202)

    let latest = token

    await expect.poll(async () => {
      latest = (await mailLink(email, 'Reset')).searchParams.get('token')!

      return latest !== token
    }).toBe(true)

    const limited = await redeem(latest)

    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(3500)
    await $fetch('/__test/recovery-state', {
      method: 'POST',
      body: { email, purpose: 'reset', emailWindow: true },
    })
    expect((await redeem(latest)).status).toBe(200)
  })

  it('rolls back token consumption and credential writes when session revocation fails', async () => {
    const email = await account()
    const cookie = cookies(await post('/api/login', { email, password }))
    const token = await requestReset(email)

    await $fetch('/__test/auth-state', {
      method: 'POST',
      body: { email, failLogout: true },
    })

    try {
      const failed = await redeem(token, cookie)

      expect(failed.status).toBe(503)
      expect(await failed.json()).toEqual({
        error: { code: 'AUTH_UNAVAILABLE' },
      })
      expect(failed.headers.get('set-cookie')).toBeNull()
      expect((await session(cookie)).status).toBe(200)
      expect((await post('/api/login', { email, password })).status).toBe(200)
      expect((await post('/api/login', { email, password: newPassword })).status).toBe(401)
    } finally {
      await $fetch('/__test/auth-state', {
        method: 'POST',
        body: { email, failLogout: false },
      })
    }

    expect((await redeem(token)).status).toBe(200)
    expect((await session(cookie)).status).toBe(401)
  })

  it('keeps authoritative session reads available when reset lock waiters saturate the transition pool', async () => {
    const observer = await account()
    const cookie = cookies(await post('/api/login', { email: observer, password }))
    const first = await account()
    const second = await account()
    const tokens = [await requestReset(first), await requestReset(second)]

    for (const email of [first, second]) {
      await $fetch('/__test/recovery-state', {
        method: 'POST',
        body: { email, gate: true },
      })
    }

    const pending = tokens.flatMap(token => Array.from({ length: 5 }, () => redeem(token)))

    try {
      await expect.poll(async () => {
        const counts = await Promise.all([first, second].map(email => $fetch<{ waiters: number }>('/__test/recovery-state', {
          method: 'POST',
          body: { email, waiters: true },
        })))

        return counts.reduce((sum, count) => sum + count.waiters, 0)
      }).toBeGreaterThanOrEqual(5)
      // Let the remaining bounded password hashes reach their lock waits too.
      await new Promise(resolve => setTimeout(resolve, 500))

      const response = await fetch(url('/api/session'), {
        headers: { cookie },
        signal: AbortSignal.timeout(2000),
      })

      expect(response.status).toBe(200)
    } finally {
      for (const email of [first, second]) {
        await $fetch('/__test/recovery-state', {
          method: 'POST',
          body: { email, gate: false },
        })
      }

      await Promise.all(pending)
    }
  })

  it('does not let an old-password login racing reset leave a valid session', async () => {
    const email = await account()
    const token = await requestReset(email)
    const [login, reset] = await Promise.all([
      post('/api/login', { email, password }),
      redeem(token),
    ])

    expect(reset.status).toBe(200)
    expect([200, 401]).toContain(login.status)
    expect((await session(cookies(login))).status).toBe(401)
    expect((await post('/api/login', { email, password: newPassword })).status).toBe(200)
  })

  it.each([
    'short',
    'a'.repeat(129),
    'abcdefgh ',
    'abcdefghé',
    'abcdefgh\t',
  ])('rejects invalid replacement input without spending the token: %s', async (credential) => {
    const email = await account()
    const token = await requestReset(email)

    expect((await redeem(token, '', credential)).status).toBe(422)
    expect((await redeem(token)).status).toBe(200)
  })

  it('rejects mismatched confirmation, malformed JSON and cross-site requests without mutation', async () => {
    const email = await account()
    const token = await requestReset(email)
    const mismatch = await post('/api/password/reset', { token, newPassword, confirmation: 'different' })

    expect(mismatch.status).toBe(422)
    expect((await mismatch.json()).error.fields.confirmation).toBe('Passwords must match.')

    for (const path of ['/api/password/forgot', '/api/password/reset']) {
      for (const headers of [
        { 'content-type': 'application/json' },
        { 'content-type': 'application/json', 'origin': 'https://evil.example' },
        { 'content-type': 'text/plain', origin },
        { 'content-type': 'application/json', origin, 'sec-fetch-site': 'cross-site' },
      ]) {
        expect((await fetch(url(path), { method: 'POST', headers, body: '{}' })).status).toBe(403)
      }

      expect((await fetch(url(path), {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: '{',
      })).status).toBe(400)
      expect((await fetch(url(path), {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          junk: 'a'.repeat(4100),
        }),
      })).status).toBe(413)
    }

    for (const path of ['/api/auth/request-password-reset', '/api/auth/reset-password', '/api/auth/change-password']) {
      expect((await post(path, { token, newPassword })).status).toBe(404)
    }

    expect((await redeem(token)).status).toBe(200)
  })

  it('recovers with captured mail, revokes every prior session and requires fresh login', async () => {
    const email = await account()
    const first = cookies(await post('/api/login', { email, password }))
    const second = cookies(await post('/api/login', { email, password }))
    const token = await requestReset(email)
    const response = await redeem(token, first)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'password-reset' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.getSetCookie().every(value => value.includes('Max-Age=0'))).toBe(true)
    expect(response.headers.get('set-cookie')).toContain('session_token=')

    for (const cookie of [first, second]) {
      expect((await session(cookie)).status).toBe(401)

      const shell = await fetch(url('/'), {
        headers: { cookie },
        redirect: 'manual',
      })

      expect(shell.headers.get('location')).toBe('/login')
      expect(shell.headers.get('cache-control')).toBe('no-store')
    }

    expect((await post('/api/login', { email, password })).status).toBe(401)
    expect((await post('/api/login', { email, password: newPassword })).status).toBe(200)
    expect((await redeem(token)).status).toBe(400)
  })
})
