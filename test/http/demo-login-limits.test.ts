import { fileURLToPath } from 'node:url'
import { setup, startServer, url } from '@nuxt/test-utils/e2e'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { provisionDemo } from '../../server/demo/provision'
import { isolatedHTTPDatabase } from '../fixtures/database'

const database = isolatedHTTPDatabase()
const password = 'PublicTest1!'
const emails = ['demo1@email.test', 'demo2@email.test']
const env = {
  DATABASE_URL: database.url,
  APP_ENV: 'demo',
  APP_TRUSTED_PROXY_IP: '127.0.0.1',
  MAIL_MODE: '',
  MAILTRAP_URL: '',
}

function login(email: string, ip: string, credential = password, headers = {}) {
  return fetch(url('/api/login'), {
    method: 'POST',
    headers: {
      'origin': 'http://localhost:3000',
      'content-type': 'application/json',
      'x-real-ip': ip,
      ...headers,
    },
    body: JSON.stringify({ email, password: credential }),
  })
}

describe('shared demo login admission over HTTP and PostgreSQL', async () => {
  beforeAll(async () => {
    await database.prepare()

    const sql = postgres(database.url)

    try {
      await provisionDemo(sql, [password, password])
    } finally {
      await sql.end()
    }
  })
  beforeEach(async () => {
    const sql = postgres(database.url)

    try {
      await sql`DELETE FROM registration_limit`
    } finally {
      await sql.end()
    }
  })
  afterAll(() => database.dispose())

  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
    env,
  })

  it('admits repeated legitimate visitors to both shared accounts through ordinary authentication', async () => {
    for (const email of emails) {
      for (let visitor = 1; visitor <= 8; visitor++) {
        const response = await login(email, `192.0.2.${visitor}`)

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ status: 'signed-in' })

        const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
        const session = await fetch(url('/api/session'), {
          headers: { cookie },
        })

        expect(session.status).toBe(200)
        expect((await session.json()).user.email).toBe(email)
      }
    }
  })

  it('shares the IP budget across accounts, failures, successes, concurrent requests, and server restarts', async () => {
    const ip = '198.51.100.20'
    const first = await login(emails[0]!, ip)

    expect(first.status).toBe(200)

    const attempts = await Promise.all(Array.from({ length: 21 }, (_, index) => login(
      index % 2
        ? emails[1]!
        : 'unknown@email.test',
      ip,
      'WrongPassword!',
    )))

    expect(attempts.filter(response => response.status === 401)).toHaveLength(19)
    expect(attempts.filter(response => response.status === 429)).toHaveLength(2)

    // A new Nitro process must use the budget consumed by the previous process.
    await startServer({ env })

    const denied = await login(emails[1]!, ip)
    const failure = await denied.json()

    expect(denied.status).toBe(429)
    expect(denied.headers.get('set-cookie')).toBeNull()
    expect(failure).toEqual({
      error: { code: 'RATE_LIMITED' },
      retryAfter: expect.any(Number),
    })
    expect(Number(denied.headers.get('retry-after'))).toBe(failure.retryAfter)
    expect(failure.retryAfter).toBeGreaterThan(3500)
    expect(failure.retryAfter).toBeLessThanOrEqual(3600)
    expect((await login(emails[1]!, '198.51.100.21')).status).toBe(200)

    // Advance only the disposable limit state, without waiting an hour.
    const sql = postgres(database.url)

    try {
      await sql`UPDATE registration_limit SET expires_at = now() - interval '1 second'`
    } finally {
      await sql.end()
    }

    expect((await login(emails[1]!, ip)).status).toBe(200)
  })

  it('enforces the overall ceiling across changing IPs and accounts', async () => {
    expect((await login(emails[0]!, '192.0.2.1')).status).toBe(200)
    expect((await login(emails[1]!, '192.0.2.2')).status).toBe(200)

    for (let batch = 0; batch < 20; batch++) {
      const count = batch === 19
        ? 23
        : 25
      const responses = await Promise.all(Array.from({ length: count }, (_, offset) => {
        const index = batch * 25 + offset

        return login(`unknown-${index}@email.test`, `198.18.${Math.floor(index / 250)}.${index % 250 + 1}`)
      }))

      expect(responses.every(response => response.status === 401)).toBe(true)
    }

    await startServer({ env })

    for (const email of emails) {
      const denied = await login(email, '203.0.113.100')

      expect(denied.status).toBe(429)
      expect(denied.headers.get('set-cookie')).toBeNull()
      expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0)
    }
  })

  it('ignores spoofed forwarding claims from an untrusted peer in demo mode', async () => {
    await startServer({
      env: { ...env, APP_TRUSTED_PROXY_IP: '192.0.2.200' },
    })

    try {
      for (let attempt = 0; attempt < 21; attempt++) {
        const response = await login('unknown@email.test', `192.0.2.${attempt + 1}`, password, {
          'x-forwarded-for': `203.0.113.${attempt + 1}`,
          'forwarded': `for=203.0.113.${attempt + 1}`,
          'x-vercel-forwarded-for': `203.0.113.${attempt + 1}`,
        })

        expect(response.status).toBe(attempt < 20
          ? 401
          : 429)
      }
    } finally {
      await startServer({ env })
    }
  })
})
