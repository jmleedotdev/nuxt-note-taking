import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('registration HTTP contract', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
    // Memory-mode tests do not require a local Mailtrap endpoint.
    env: { MAILTRAP_URL: '' },
    nuxtConfig: {
      nitro: {
        handlers: [
          {
            route: '/__test/mail',
            handler: fileURLToPath(new URL('../fixtures/mail.ts', import.meta.url)),
          },
        ],
      },
    },
  })

  it('returns actionable field errors without reflecting secrets', async () => {
    const response = await fetch(url('/api/registration'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'broken', password: 'secret' }),
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      error: {
        code: 'VALIDATION',
        fields: { email: 'Enter a valid email address.', password: 'Use 8–128 characters: English letters, numbers, and symbols only. No spaces.' },
      },
    })
  })

  it('accepts valid recipients outside example.test', async () => {
    const response = await fetch(url('/api/registration'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'person@example.com', password: 'a-long-password!' }),
    })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'check-email', resendAfter: 30 })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it.each([
    [
      'too-short',
      'a'.repeat(7),
      422,
    ],
    [
      'minimum-length',
      'a'.repeat(8),
      202,
    ],
    [
      'maximum-length',
      'a'.repeat(128),
      202,
    ],
    [
      'too-long',
      'a'.repeat(129),
      422,
    ],
    ['symbols-only', '!@#$%^&*()_+-=[]{}|;:,.<>?/~', 202],
    ['numbers-only', '012345678901234', 202],
    ['leading-space', ' abcdefghijklmno', 422],
    ['trailing-space', 'abcdefghijklmno ', 422],
    ['interior-space', 'abcdefg hijklmno', 422],
    ['line-feed', 'abcdefghijklmno\n', 422],
    ['tab', 'abcdefghijklmno\t', 422],
    ['unicode', 'abcdefghijklmnoé', 422],
  ])('enforces printable ASCII without spaces: %s', async (name, password, status) => {
    const response = await fetch(url('/api/registration'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: `${name}@example.test`, password }),
    })

    expect(response.status).toBe(status)
  })

  it('rejects cross-origin registration and unmounted underlying auth routes', async () => {
    const response = await fetch(url('/api/registration'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'https://evil.example' },
      body: JSON.stringify({ email: 'cross@example.test', password: 'a-long-password!' }),
    })

    expect(response.status).toBe(403)

    for (const path of [
      '/api/auth/sign-up/email',
      '/api/auth/sign-in/email',
      '/api/auth/send-verification-email',
      '/api/auth/reset-password',
    ]) {
      expect((await fetch(url(path), { method: 'POST' })).status).toBe(404)
    }
  })

  it('atomically limits concurrent registration by email with a 30-second cooldown', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => fetch(url('/api/registration'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'concurrent@example.test', password: 'a-long-password!' }),
    })))

    expect(results.filter(result => result.status === 202)).toHaveLength(1)
    expect(results.filter(result => result.status === 429)).toHaveLength(7)
    expect(results.find(result => result.status === 429)!.headers.get('retry-after')).toBeTruthy()
  })

  it('enforces exactly 20 hourly IP submissions despite spoofed forwarding chains', async () => {
    const statuses: number[] = []

    for (let index = 0; index < 21; index++) {
      const response = await fetch(url('/api/registration'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'origin': 'http://localhost:3000',
          'x-real-ip': '192.0.2.20',
          'x-forwarded-for': `198.51.100.${index}`,
        },
        body: JSON.stringify({ email: `ip-limit-${index}@example.test`, password: 'a-long-password!' }),
      })

      statuses.push(response.status)
    }

    expect(statuses.slice(0, 20)).toEqual(Array.from({ length: 20 }).fill(202))
    expect(statuses[20]).toBe(429)
  })

  it('enforces five hourly attempts by email independently of the cooldown', async () => {
    const retryValues: number[] = []

    for (let index = 0; index < 6; index++) {
      const response = await fetch(url('/api/registration/resend'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000', 'x-real-ip': '192.0.2.30' },
        body: JSON.stringify({ email: 'email-ceiling@example.test' }),
      })

      expect(response.status).toBe(index === 0
        ? 202
        : 429)
      retryValues.push(Number(response.headers.get('retry-after') ?? '0'))
    }

    expect(retryValues.slice(1, 5).every(value => value > 0 && value <= 30)).toBe(true)
    expect(retryValues[5]).toBeGreaterThan(3500)
  })

  it('recovers after the real 30-second database cooldown expires', async () => {
    const submit = () => fetch(url('/api/registration/resend'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000', 'x-real-ip': '192.0.2.40' },
      body: JSON.stringify({ email: 'cooldown-expiry@example.test' }),
    })

    expect((await submit()).status).toBe(202)

    const denied = await submit()

    expect(denied.status).toBe(429)

    const seconds = Number(denied.headers.get('retry-after'))

    expect(seconds).toBeGreaterThan(0)
    expect(seconds).toBeLessThanOrEqual(30)
    await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 100))
    expect((await submit()).status).toBe(202)
  }, 90000)

  it('offers generic recovery after mail failure, without leaking account existence', async () => {
    await $fetch('/__test/mail', {
      method: 'POST',
      body: { fail: true },
    })

    const response = await fetch(url('/api/registration'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'delivery-failed@example.test', password: 'a-long-password!' }),
    })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'check-email', resendAfter: 30 })
    await $fetch('/__test/mail', {
      method: 'POST',
      body: { fail: false },
    })

    const resend = await fetch(url('/api/registration/resend'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'unknown@example.org' }),
    })

    expect(resend.status).toBe(202)
    expect(await resend.json()).toEqual({ status: 'check-email', resendAfter: 30 })
  })

  it('registers without a session and submits application-owned verification mail', async () => {
    const response = await fetch(url('/api/registration'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'first@example.test', password: 'a-long-password!' }),
    })
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body).toEqual({ status: 'check-email', resendAfter: 30 })
    expect(response.headers.get('set-cookie')).toBeNull()

    const messages = await $fetch<any[]>('/__test/mail')
    const message = messages.find(message => message.to === 'first@example.test')!

    expect(message.to).toBe('first@example.test')
    expect(message.text).toContain('one hour')
    expect(message.html).toContain('data-mt-no-track')

    const link = message.text.match(/https?:\/\/\S+/)[0]
    const verificationURL = new URL(link)

    expect(verificationURL.pathname).toBe('/api/registration/verify')

    const claims = JSON.parse(Buffer.from(verificationURL.searchParams.get('token')!.split('.')[1]!, 'base64url').toString())

    expect(claims.exp - claims.iat).toBe(3600)

    const verified = await fetch(url(verificationURL.pathname + verificationURL.search), { redirect: 'manual' })

    expect(verified.status).toBe(303)
    expect(verified.headers.get('location')).toBe('/login?verified=1')
    expect(verified.headers.get('set-cookie')).toBeNull()
    expect(JSON.stringify(body)).not.toMatch(/token|password|user|account/)
  })
})
