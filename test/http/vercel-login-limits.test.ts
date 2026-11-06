import { fileURLToPath } from 'node:url'
import { setup, startServer, url } from '@nuxt/test-utils/e2e'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { provisionDemo } from '../../server/demo/provision'
import { isolatedHTTPDatabase } from '../fixtures/database'

const database = isolatedHTTPDatabase()
const password = 'PublicTest1!'
const env = {
  DATABASE_URL: database.url,
  APP_ENV: 'demo',
  APP_TRUSTED_PROXY_IP: '192.0.2.200',
  MAIL_MODE: '',
  MAILTRAP_URL: '',
}

function login(ip: string | undefined, claims: Record<string, string> = {}) {
  return fetch(url('/api/login'), {
    method: 'POST',
    headers: {
      'origin': 'http://localhost:3000',
      'content-type': 'application/json',
      ...(ip !== undefined
        ? { 'x-vercel-forwarded-for': ip }
        : {}),
      'x-forwarded-for': '203.0.113.99',
      'x-real-ip': '203.0.113.99',
      'forwarded': 'for=203.0.113.99',
      ...claims,
    },
    body: JSON.stringify({ email: 'demo1@email.test', password }),
  })
}

describe('demo login behind the Vercel Production ingress', async () => {
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

  // HTTP checks simulate runtime identity and the already-overwritten header.
  // Spoof resistance at the actual edge is verified separately on the deployment.
  it('keeps different platform client addresses independent without an account-wide allowance', async () => {
    await startServer({
      env: { ...env, VERCEL: '1', VERCEL_ENV: 'production' },
    })

    for (let visitor = 1; visitor <= 21; visitor++) {
      const response = await login(`198.51.100.${visitor}`)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'signed-in' })
    }
  })

  it('retains the per-address ceiling regardless of alternative forwarding claims', async () => {
    await startServer({
      env: { ...env, VERCEL: '1', VERCEL_ENV: 'production' },
    })

    for (let attempt = 0; attempt < 21; attempt++) {
      const response = await login('198.51.100.44', {
        'x-real-ip': `192.0.2.${attempt + 1}`,
        'x-forwarded-for': `203.0.113.${attempt + 1}`,
        'forwarded': `for=203.0.113.${attempt + 1}`,
      })

      expect(response.status).toBe(attempt < 20
        ? 200
        : 429)
    }

    expect((await login('198.51.100.45')).status).toBe(200)
  })

  it('uses one bounded fallback for missing, invalid, and chained platform addresses', async () => {
    await startServer({
      env: { ...env, VERCEL: '1', VERCEL_ENV: 'production' },
    })

    for (let attempt = 0; attempt < 21; attempt++) {
      const ip = [undefined, 'not-an-ip', '198.51.100.1, 203.0.113.2'][attempt % 3]
      const response = await login(ip, { 'x-real-ip': `192.0.2.${attempt + 1}`, 'x-forwarded-for': `203.0.113.${attempt + 1}` })

      expect(response.status).toBe(attempt < 20
        ? 200
        : 429)
    }

    expect((await login('198.51.100.46')).status).toBe(200)
  })

  it('does not trust Vercel-named headers outside the actual platform runtime', async () => {
    await startServer({
      env: { ...env, VERCEL: '', VERCEL_ENV: 'production' },
    })

    for (let attempt = 0; attempt < 21; attempt++) {
      const response = await login(`198.51.100.${attempt + 1}`)

      expect(response.status).toBe(attempt < 20
        ? 200
        : 429)
    }
  })
})
