import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isolatedHTTPDatabase } from '../fixtures/database'

let index = 0

function post(purpose: 'forgot' | 'reset', email = `limit-${index}@example.test`, address = `198.19.${Math.floor(index / 250)}.${index++ % 250 + 1}`) {
  return fetch(url(`/api/password/${purpose}`), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'http://localhost:3000',
      'x-real-ip': address,
      'x-forwarded-for': '203.0.113.99',
    },
    body: JSON.stringify(purpose === 'forgot'
      ? { email }
      : { token: email, newPassword: 'Abcdef1!', confirmation: 'Abcdef1!' }),
  })
}

function state(body: object) {
  return $fetch('/__test/recovery-state', { method: 'POST', body })
}

describe('shared atomic recovery admission thresholds', async () => {
  const database = isolatedHTTPDatabase()

  beforeAll(() => database.prepare())
  afterAll(() => database.dispose())
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    env: { DATABASE_URL: database.url, APP_TRUSTED_PROXY_IP: '127.0.0.1', MAILTRAP_URL: '' },
    nuxtConfig: {
      nitro: {
        handlers: [
          {
            route: '/__test/recovery-state',
            handler: fileURLToPath(new URL('../fixtures/recovery-state.ts', import.meta.url)),
          },
        ],
      },
    },
  })

  it('atomically admits one concurrent request per lowercased email in thirty seconds', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, (_, i) => post('forgot', i % 2
      ? 'Cooldown@example.test'
      : 'cooldown@example.test')))

    expect(responses.filter(response => response.status === 202)).toHaveLength(1)
    expect(responses.filter(response => response.status === 429)).toHaveLength(3)
    expect(Number(responses.find(response => response.status === 429)!.headers.get('retry-after'))).toBeGreaterThan(25)
    await new Promise(resolve => setTimeout(resolve, 30100))
    expect((await post('forgot', 'cooldown@example.test')).status).toBe(202)
  })

  it('admits five requests per email/hour across IPs and resets an expired window', async () => {
    const email = 'email-limit@example.test'

    for (let attempt = 0; attempt < 6; attempt++) {
      await state({ email, cooldown: true })

      const response = await post('forgot', email)

      expect(response.status).toBe(attempt < 5
        ? 202
        : 429)

      if (attempt === 5)
        expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(3500)
    }

    await state({ email, cooldown: true, emailWindow: true })
    expect((await post('forgot', email)).status).toBe(202)
  })

  it.each(['forgot', 'reset'] as const)('admits twenty %s attempts/IP/hour despite varied subjects and forwarded headers', async (purpose) => {
    const address = purpose === 'forgot'
      ? '203.0.113.10'
      : '203.0.113.11'
    const statuses: number[] = []

    for (let attempt = 0; attempt < 21; attempt++) {
      const subject = purpose === 'forgot'
        ? `ip-${attempt}@example.test`
        : attempt.toString(16).padStart(64, '0')
      const response = await post(purpose, subject, address)

      statuses.push(response.status)
    }

    expect(statuses.slice(0, 20)).toEqual(Array.from({ length: 20 }).fill(purpose === 'forgot'
      ? 202
      : 400))
    expect(statuses[20]).toBe(429)
    await state({ purpose, address, ipWindow: true })
    expect((await post(purpose, purpose === 'forgot'
      ? 'after-ip@example.test'
      : 'f'.repeat(64), address)).status).toBe(purpose === 'forgot'
      ? 202
      : 400)
  })

  it('limits repeated reset authorization attempts to five/hour across IPs', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => post('reset', 'b'.repeat(64))))

    expect(responses.filter(response => response.status === 400)).toHaveLength(5)
    expect(responses.filter(response => response.status === 429)).toHaveLength(3)
  })

  it.each(['forgot', 'reset'] as const)('admits exactly five hundred %s attempts globally/hour', async (purpose) => {
    await state({ purpose, globalWindow: true })

    const statuses: number[] = []

    for (let attempt = 0; attempt < 501; attempt++) {
      const subject = purpose === 'forgot'
        ? `global-${attempt}@example.test`
        : (attempt + 1000).toString(16).padStart(64, '0')
      const response = await post(purpose, subject)

      statuses.push(response.status)
    }

    expect(statuses.slice(0, 500)).toEqual(Array.from({ length: 500 }).fill(purpose === 'forgot'
      ? 202
      : 400))
    expect(statuses[500]).toBe(429)
    await state({ purpose, globalWindow: true })
    expect((await post(purpose, purpose === 'forgot'
      ? 'after-global@example.test'
      : 'e'.repeat(64))).status).toBe(purpose === 'forgot'
      ? 202
      : 400)
  })
})
