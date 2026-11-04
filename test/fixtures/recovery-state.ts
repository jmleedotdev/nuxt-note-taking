import type { ReservedSql } from 'postgres'
import { createHmac } from 'node:crypto'
import { defineEventHandler, readBody } from 'h3'
import { authService } from '../../server/auth/service'

const gates = new Map<string, ReservedSql>()

// Test-only state/time preconditions. Never mounted in application builds.
export default defineEventHandler(async (event) => {
  const { email, cooldown, emailWindow, expiresIn, ageResetSeconds, globalWindow, ipWindow, purpose = 'forgot', address, gate, waiters } = await readBody(event)
  const { client, config } = authService()
  const digest = (value: string) => createHmac('sha256', config.APP_AUTH_SECRET).update(value).digest('hex')

  if (gate === true) {
    const connection = await client.reserve()

    await connection`SELECT pg_advisory_lock(hashtextextended(${`credential:${email}`}, 0))`
    gates.set(email, connection)
  } else if (gate === false) {
    const connection = gates.get(email)!

    await connection`SELECT pg_advisory_unlock(hashtextextended(${`credential:${email}`}, 0))`
    connection.release()
    gates.delete(email)
  }

  if (waiters) {
    const rows = await client`
      SELECT count(*)::int AS count FROM pg_locks
      WHERE locktype = 'advisory' AND NOT granted
      AND objid::bigint = (hashtextextended(${`credential:${email}`}, 0) & 4294967295)
      AND classid::bigint = ((hashtextextended(${`credential:${email}`}, 0) >> 32) & 4294967295)
    `

    return { waiters: rows[0]!.count }
  }

  if (typeof ageResetSeconds === 'number')
    await client`UPDATE password_reset SET expires_at = expires_at - ${ageResetSeconds} * interval '1 second' WHERE user_id IN (SELECT id FROM "user" WHERE email = ${email})`

  if (cooldown)
    await client`UPDATE registration_limit SET expires_at = clock_timestamp() WHERE key = ${`forgot:cooldown:${digest(email)}`}`

  if (emailWindow)
    await client`UPDATE registration_limit SET expires_at = clock_timestamp() WHERE key = ${`${purpose}:email:${digest(email)}`}`

  if (globalWindow)
    await client`UPDATE registration_limit SET expires_at = clock_timestamp() WHERE key = ${`${purpose}:global`}`

  if (ipWindow)
    await client`UPDATE registration_limit SET expires_at = clock_timestamp() WHERE key = ${`${purpose}:ip:${digest(address)}`}`

  if (typeof expiresIn === 'number')
    await client`UPDATE password_reset SET expires_at = clock_timestamp() + ${expiresIn} * interval '1 second' WHERE user_id IN (SELECT id FROM "user" WHERE email = ${email})`

  return { status: 'configured' }
})
