import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isolatedHTTPDatabase } from '../fixtures/database'

describe('shared global registration admission', async () => {
  const database = isolatedHTTPDatabase()

  beforeAll(() => database.prepare())
  // Vitest unwinds teardown hooks in reverse: stop Nitro before dropping its database.
  afterAll(() => database.dispose())
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    env: { DATABASE_URL: database.url, APP_TRUSTED_PROXY_IP: '127.0.0.1' },
  })

  it('admits exactly 500 unique email/IP recovery requests per hour', async () => {
    const statuses: number[] = []

    for (let index = 0; index < 501; index++) {
      const response = await fetch(url('/api/registration/resend'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000', 'x-real-ip': `192.0.${Math.floor(index / 250)}.${index % 250 + 1}` },
        body: JSON.stringify({ email: `global-${index}@example.test` }),
      })

      statuses.push(response.status)
    }

    expect(statuses.slice(0, 500)).toEqual(Array.from({ length: 500 }).fill(202))
    expect(statuses[500]).toBe(429)
  })
})
