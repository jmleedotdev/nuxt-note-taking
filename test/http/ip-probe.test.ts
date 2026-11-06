import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isolatedHTTPDatabase } from '../fixtures/database'

const secret = 'disposable-operator-probe-secret-32-characters'
const database = isolatedHTTPDatabase()

describe('temporary private ingress probe', async () => {
  beforeAll(() => database.prepare())
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
  })

  it('rejects public credentials and reports no raw addresses or secrets to the authorized operator', async () => {
    for (const authorization of ['', 'Bearer password1', 'Bearer incorrect']) {
      const response = await fetch(url('/api/operations/ip-probe'), {
        headers: { authorization },
      })

      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }

    const headers = { 'authorization': `Bearer ${secret}`, 'x-operator-probe-nonce': '1234567890abcdef1234567890abcdef', 'x-vercel-forwarded-for': '198.51.100.8' }
    const first = await fetch(url('/api/operations/ip-probe'), { headers })
    const text = await first.text()

    expect(first.status).toBe(200)
    expect(text).not.toContain('198.51.100.8')
    expect(text).not.toContain(secret)

    const data = JSON.parse(text)

    expect(data.addresses['x-vercel-forwarded-for'].validIP).toBe(true)
    expect(data.addresses['x-vercel-forwarded-for'].fingerprint).toMatch(/^[a-f0-9]{64}$/)

    const second = await fetch(url('/api/operations/ip-probe'), { headers })

    expect((await second.json()).addresses).toEqual(data.addresses)

    const noNonce = await fetch(url('/api/operations/ip-probe'), {
      headers: { authorization: `Bearer ${secret}` },
    })

    expect(noNonce.status).toBe(422)
  })
})
