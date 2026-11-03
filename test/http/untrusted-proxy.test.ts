import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isolatedHTTPDatabase } from '../fixtures/database'

describe('registration with an untrusted TCP peer', async () => {
  const database = isolatedHTTPDatabase()

  beforeAll(() => database.prepare())
  // Vitest unwinds teardown hooks in reverse: stop Nitro before dropping its database.
  afterAll(() => database.dispose())
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    env: { DATABASE_URL: database.url, APP_TRUSTED_PROXY_IP: '192.0.2.200' },
  })

  it('ignores forged X-Real-IP and forwarding chains from untrusted peers', async () => {
    const statuses: number[] = []

    for (let index = 0; index < 21; index++) {
      const response = await fetch(url('/api/registration/resend'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'origin': 'http://localhost:3000',
          'x-real-ip': `198.51.100.${index}`,
          'x-forwarded-for': `203.0.113.${index}`,
        },
        body: JSON.stringify({ email: `untrusted-${index}@example.test` }),
      })

      statuses.push(response.status)
    }

    expect(statuses.slice(0, 20)).toEqual(Array.from({ length: 20 }).fill(202))
    expect(statuses[20]).toBe(429)
  })
})
