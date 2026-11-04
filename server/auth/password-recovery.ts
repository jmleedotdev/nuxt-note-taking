import type { TransactionSql } from 'postgres'
import type { createDatabase } from '../db/client'
import type { authConfig } from './config'
import type { MailSender } from './mail'
import { createHash, randomBytes } from 'node:crypto'
import { resetMessage } from './mail'
import { hashPassword } from './password'

interface Dependencies {
  client: ReturnType<typeof createDatabase>['client']
  config: ReturnType<typeof authConfig>
  sender: MailSender
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

// Login, issuance, and redemption use this same database-wide lock namespace.
// A token-row lock alone cannot serialize login or issuance before a row exists.
export function credentialLockKey(email: string) {
  return `credential:${email}`
}

// Shared atomic transition for reset and a future authenticated password change.
// The caller must hold the credential lock and authorize the transition in this transaction.
export async function replaceCredential(sql: TransactionSql, userId: string, hash: string) {
  const updated = await sql`
    UPDATE account SET password = ${hash}, updated_at = clock_timestamp()
    WHERE user_id = ${userId} AND provider_id = 'credential'
    RETURNING id
  `

  if (updated.length !== 1)
    throw new Error('Credential transition unavailable')

  await sql`DELETE FROM session WHERE user_id = ${userId}`
  await sql`DELETE FROM password_reset WHERE user_id = ${userId}`
}

export function createPasswordRecovery({ client, config, sender }: Dependencies) {
  async function subject(token: string): Promise<string | undefined> {
    const rows = await client`
      SELECT u.email FROM password_reset r JOIN "user" u ON u.id = r.user_id
      WHERE r.token_hash = ${tokenHash(token)}
    `

    return rows[0]?.email
  }

  return {
    subject,
    async issue(email: string) {
      const token = randomBytes(32).toString('hex')
      const issued = await client.begin(async (sql) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${credentialLockKey(email)}, 0))`

        // Same statements for known/unknown addresses. Commit before returning,
        // so even failed delivery cannot leave the previous authorization valid.
        return sql`
          INSERT INTO password_reset (user_id, token_hash, expires_at)
          SELECT u.id, ${tokenHash(token)}, clock_timestamp() + interval '30 minutes'
          FROM "user" u WHERE u.email = ${email}
          AND EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential')
          ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at
          RETURNING user_id
        `
      })

      // The HTTP handler lifecycle-tracks this work, but never awaits provider latency.
      return {
        async deliver() {
          if (!issued.length)
            return

          // No automatic retries. If transport retries are added, reuse this token,
          // check it is still current, and never extend its expiry.
          const current = await client`
            SELECT 1 FROM password_reset WHERE token_hash = ${tokenHash(token)} AND expires_at > clock_timestamp()
          `

          if (!current.length)
            return

          const link = new URL('/reset-password', config.APP_URL)

          link.searchParams.set('token', token)
          await sender.send(resetMessage(email, link.href))
        },
      }
    },
    async redeem(token: string, password: string) {
      const email = await subject(token)

      if (!email)
        return false

      const hash = await hashPassword(password)

      return client.begin(async (sql) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${credentialLockKey(email)}, 0))`

        // Recheck after lock acquisition and hashing, using wall time rather than
        // transaction-start now(). Deletes and credential/session writes roll back together.
        const authorized = await sql`
          DELETE FROM password_reset WHERE token_hash = ${tokenHash(token)}
          AND expires_at > clock_timestamp() RETURNING user_id
        `

        if (!authorized.length)
          return false

        await replaceCredential(sql, authorized[0]!.user_id, hash)

        return true
      })
    },
  }
}
