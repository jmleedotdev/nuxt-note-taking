import type { authConfig } from './config'

export interface MailMessage { to: string, subject: string, text: string, html: string }

export interface MailSender { send: (message: MailMessage) => Promise<void> }

export class MemoryMailSender implements MailSender {
  readonly messages: MailMessage[] = []
  fail = false
  delay = 0
  async send(message: MailMessage) {
    const fail = this.fail

    if (this.delay)
      await new Promise(resolve => setTimeout(resolve, this.delay))

    if (fail) {
      throw new Error('Test mail unavailable')
    }

    this.messages.push(message)
  }
}

export function createMailSender(config: ReturnType<typeof authConfig>): MailSender {
  if (config.MAIL_MODE === 'memory') {
    return new MemoryMailSender()
  }

  const endpoint = new URL('/api/v1/ingest', config.MAILTRAP_URL!)

  return {
    async send(message) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          smtp_from: 'notes@example.test',
          smtp_to: [message.to],
          from: { address: 'notes@example.test', name: 'Note' },
          to: [
            { address: message.to },
          ],
          subject: message.subject,
          text: message.text,
          html: message.html,
          // HTTP capture has no raw MIME source; Local 0.4.1 requires a non-null blob.
          raw: '',
        }),
      })

      if (response.status !== 201) {
        await response.body?.cancel()
        throw new Error('Local mail capture failed')
      }

      const result = await response.json() as { ID?: unknown } | null

      if (!result || typeof result.ID !== 'string' || !result.ID) {
        throw new Error('Local mail capture failed')
      }
    },
  }
}

export function resetMessage(to: string, link: string): MailMessage {
  // The application generates this URL from its configured origin and a hex token.
  const escapedLink = link.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

  return {
    to,
    subject: 'Reset your password for Note',
    text: `Reset your Note password. This link expires in thirty minutes and works once. Only the newest link works.\n\n${link}\n\nIf you did not request this, ignore this message.`,
    html: `<p>Reset your Note password. This link expires in thirty minutes and works once. Only the newest link works.</p><p><a data-mt-no-track href="${escapedLink}">Reset password</a></p><p>If you did not request this, ignore this message.</p>`,
  }
}

export function verificationMessage(to: string, link: string): MailMessage {
  const escapedLink = link.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

  return {
    to,
    subject: 'Verify your email for Note',
    text: `Verify your email to start using Note. This link expires in one hour.\n\n${link}\n\nIf you did not request this, ignore this message.`,
    html: `<p>Verify your email to start using Note. This link expires in one hour.</p><p><a data-mt-no-track href="${escapedLink}">Verify email</a></p><p>If you did not request this, ignore this message.</p>`,
  }
}
