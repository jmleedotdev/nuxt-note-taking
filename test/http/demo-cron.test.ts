import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { provisionDemo } from '../../server/demo/provision'
import { isolatedHTTPDatabase } from '../fixtures/database'

const database = isolatedHTTPDatabase()
const password = 'PublicTest1!'
const secret = 'private-disposable-cron-secret-32-characters'

async function login() {
  const response = await fetch(url('/api/login'), {
    method: 'POST',
    headers: { 'origin': 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo1@email.test', password }),
  })

  expect(response.status).toBe(200)

  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
}

async function clock(now: string) {
  const response = await fetch(url('/__test/demo-lifecycle'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ now }),
  })

  expect(response.status).toBe(200)
}

function cron(authorization = `Bearer ${secret}`, cookie = '') {
  return fetch(url('/api/cron/demo-reset'), {
    headers: { authorization, cookie },
  })
}

describe('authenticated scheduled daily demo reset', async () => {
  beforeAll(async () => {
    await database.prepare()

    const sql = postgres(database.url)

    try {
      await provisionDemo(sql, [password, password])
      await sql`CREATE TABLE test_demo_clock (instant timestamptz NOT NULL)`
      await sql`INSERT INTO test_demo_clock VALUES ('2030-01-01T23:59:59Z')`
    } finally {
      await sql.end()
    }
  })
  afterAll(() => database.dispose())

  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
    env: {
      DATABASE_URL: database.url,
      APP_ENV: 'demo',
      CRON_SECRET: secret,
      MAIL_MODE: '',
      MAILTRAP_URL: '',
    },
    nuxtConfig: {
      alias: {
        '#demo-clock': fileURLToPath(new URL('../fixtures/demo-clock.ts', import.meta.url)),
      },
      nitro: {
        handlers: [
          {
            route: '/__test/demo-lifecycle',
            handler: fileURLToPath(new URL('../fixtures/demo-lifecycle.ts', import.meta.url)),
          },
        ],
      },
    },
  })

  it('rejects absent/invalid authorization and public credentials without advancing the reset period', async () => {
    const cookie = await login()

    await clock('2030-01-02T00:30:00Z')

    for (const authorization of [
      '',
      'Bearer wrong',
      `Bearer ${password}`,
      `Basic ${btoa(`demo1@email.test:${password}`)}`,
    ]) {
      const response = await cron(authorization, cookie)

      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('set-cookie')).toBeNull()
    }

    // Rewind only the disposable clock: rejected calls must not revoke yesterday's session.
    await clock('2030-01-01T23:59:59Z')
    expect((await fetch(url('/api/session'), {
      headers: { cookie },
    })).status).toBe(200)
  })

  it('restores the current baseline once and preserves new work on concurrent and late scheduled delivery', async () => {
    const oldCookie = await login()

    await clock('2030-01-05T00:45:00Z')
    expect((await cron()).status).toBe(200)
    expect((await fetch(url('/api/session'), {
      headers: { cookie: oldCookie },
    })).status).toBe(401)

    const cookie = await login()
    const notes = () => fetch(url('/api/notes'), {
      headers: { cookie },
    }).then(response => response.json())

    expect((await notes()).notes).toHaveLength(3)
    expect((await fetch(url('/api/notes'), {
      method: 'POST',
      headers: { cookie, 'origin': 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Keep today’s visitor work' }),
    })).status).toBe(201)

    const before = await notes()

    await clock('2030-01-05T23:59:59Z')

    const responses = await Promise.all(Array.from({ length: 6 }, () => cron()))

    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200, 200, 200])
    expect(await notes()).toEqual(before)
    expect((await fetch(url('/api/session'), {
      headers: { cookie },
    })).status).toBe(200)

    // Request-time enforcement wins when the next day's cron has not arrived.
    await clock('2030-01-06T00:01:00Z')
    expect((await fetch(url('/api/session'), {
      headers: { cookie },
    })).status).toBe(401)

    const currentCookie = await login()

    expect((await cron()).status).toBe(200)
    expect((await fetch(url('/api/session'), {
      headers: { cookie: currentCookie },
    })).status).toBe(200)
  })
})
