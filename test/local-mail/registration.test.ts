import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const mailtrapURL = process.env.MAILTRAP_URL ?? 'http://127.0.0.1:3550'

interface CapturedSummary { id: string, to: { address: string }[] }
interface CapturedMessage { subject: string, text: string, html: string }

describe('mailtrap Local capture', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
    env: { MAIL_MODE: 'local', MAILTRAP_URL: mailtrapURL },
  })

  it('captures real registration and password recovery mail without creating a session', async () => {
    const email = `local-${randomUUID()}@example.com`
    const ids: string[] = []

    try {
      const response = await fetch(url('/api/registration'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
        body: JSON.stringify({ email, password: 'a-local-password!' }),
      })

      expect(response.status).toBe(202)
      expect(await response.json()).toEqual({ status: 'check-email', resendAfter: 30 })
      expect(response.headers.get('set-cookie')).toBeNull()

      const search = await fetch(`${mailtrapURL}/api/v1/search?query=${encodeURIComponent(email)}`, {
        signal: AbortSignal.timeout(5000),
      })

      expect(search.status).toBe(200)

      const result = await search.json() as { messages: CapturedSummary[] }
      const matches = result.messages.filter(message => message.to.some(to => to.address === email))

      ids.push(...matches.map(message => message.id))
      expect(matches).toHaveLength(1)

      const capture = await fetch(`${mailtrapURL}/api/v1/message/${ids[0]}`, {
        signal: AbortSignal.timeout(5000),
      })

      expect(capture.status).toBe(200)

      const message = await capture.json() as CapturedMessage

      // Assert predicates so assertion failures cannot print verification tokens.
      expect(message.subject.includes('Verify your email')).toBe(true)
      expect(message.text.includes('one hour')).toBe(true)
      expect(message.html.includes('data-mt-no-track')).toBe(true)

      const link = message.text.match(/https?:\/\/\S+/)?.[0]

      if (!link) {
        throw new Error('No verification link captured')
      }

      const verification = new URL(link)

      expect(verification.pathname).toBe('/api/registration/verify')

      const verified = await fetch(url(verification.pathname + verification.search), { redirect: 'manual' })

      expect(verified.status).toBe(303)
      expect(verified.headers.get('location')).toBe('/login?verified=1')
      expect(verified.headers.get('set-cookie')).toBeNull()

      const forgot = await fetch(url('/api/password/forgot'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
        body: JSON.stringify({ email }),
      })

      expect(forgot.status).toBe(202)

      let resetMessage: CapturedMessage | undefined

      await expect.poll(async () => {
        const search = await fetch(`${mailtrapURL}/api/v1/search?query=${encodeURIComponent(email)}`, {
          signal: AbortSignal.timeout(5000),
        })
        const result = await search.json() as { messages: CapturedSummary[] }
        const matches = result.messages.filter(message => message.to.some(to => to.address === email) && !ids.includes(message.id))

        for (const match of matches) {
          ids.push(match.id)

          const response = await fetch(`${mailtrapURL}/api/v1/message/${match.id}`, {
            signal: AbortSignal.timeout(5000),
          })
          const message = await response.json() as CapturedMessage

          if (message.subject.includes('Reset'))
            resetMessage = message
        }

        return Boolean(resetMessage)
      }).toBe(true)
      expect(resetMessage!.text.includes('thirty minutes')).toBe(true)
      expect(resetMessage!.html.includes('data-mt-no-track')).toBe(true)

      const resetLink = resetMessage!.text.match(/https?:\/\/\S+/)?.[0]

      if (!resetLink)
        throw new Error('No reset link captured')

      const resetURL = new URL(resetLink)

      expect(resetURL.pathname).toBe('/reset-password')

      const reset = await fetch(url('/api/password/reset'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'origin': 'http://localhost:3000' },
        body: JSON.stringify({
          token: resetURL.searchParams.get('token'),
          newPassword: 'NewPassword1!',
          confirmation: 'NewPassword1!',
        }),
      })

      expect(reset.status).toBe(200)
      expect(await reset.json()).toEqual({ status: 'password-reset' })
      expect(reset.headers.getSetCookie().every(cookie => cookie.includes('Max-Age=0'))).toBe(true)
    } finally {
      // Never clear a shared inbox: delete only this test's correlated messages.
      if (ids.length) {
        const cleanup = await fetch(`${mailtrapURL}/api/v1/messages`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids }),
          signal: AbortSignal.timeout(5000),
        })

        expect(cleanup.status).toBe(200)
      }
    }
  })
})
