import type { TransactionSql } from 'postgres'
import postgres from 'postgres'
import { demoDay } from '#demo-clock'
import { authConfig } from '../auth/config'
import { demoAccounts } from './accounts'
import { insertDemoNotes } from './baseline'

// Lock waiters cannot use the pools needed by the lock holder's auth/notes work.
// Transaction-scoped advisory locks also work through transaction poolers.
let coordination: ReturnType<typeof postgres> | undefined

function lifecycleClient() {
  return coordination ??= postgres(authConfig().DATABASE_URL, { max: 5 })
}

async function lock(sql: TransactionSql) {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended('portfolio-demo-lifecycle', 0))`
}

async function completedDay(sql: TransactionSql) {
  const [row] = await sql`SELECT completed_day FROM demo_lifecycle WHERE id = 'daily'`

  return row?.completed_day as string | undefined
}

// Shared by request-time enforcement and the later authenticated scheduler.
// No public/manual-reset endpoint: a completed day is never replayed.
export async function ensureDemoDay() {
  if (authConfig().APP_ENV !== 'demo')
    throw new Error('Daily reset is only available in demo mode')

  await lifecycleClient().begin(async (sql) => {
    await lock(sql)

    const day = await demoDay(sql)
    const completed = await completedDay(sql)

    if (completed && completed >= day)
      return

    // Validate both identities before changing anything; never adopt unrelated data.
    for (const account of demoAccounts) {
      const rows = await sql`SELECT id FROM "user" WHERE id = ${account.id} AND email = ${account.email} AND email_verified = true`

      if (rows.length !== 1)
        throw new Error('Demo baseline identities are not provisioned')
    }

    for (const [index, account] of demoAccounts.entries()) {
      await sql`DELETE FROM session WHERE user_id = ${account.id}`
      await sql`DELETE FROM notes WHERE owner_id = ${account.id}`
      await sql`DELETE FROM appearance_preferences WHERE owner_id = ${account.id}`
      await sql`INSERT INTO appearance_preferences (owner_id) VALUES (${account.id})`
      await insertDemoNotes(sql, account.id, index)
    }

    await sql`INSERT INTO demo_lifecycle (id, completed_day) VALUES ('daily', ${day}) ON CONFLICT (id) DO UPDATE SET completed_day = EXCLUDED.completed_day`
  })
}

// Commit restoration BEFORE accessing data through the application pools. Then
// reacquire the same lock and recheck the day: midnight or another instance may
// have intervened. Holding it through authorization AND the full operation keeps
// old requests from writing after reset. No reset runs inside this transaction,
// so an application error cannot roll back an already exposed baseline.
export async function withDemoAccess<T>(operation: () => Promise<T>): Promise<T> {
  if (authConfig().APP_ENV !== 'demo')
    return operation()

  const retry = Symbol('boundary crossed')

  while (true) {
    await ensureDemoDay()

    const result = await lifecycleClient().begin(async (sql) => {
      await lock(sql)

      const day = await demoDay(sql)
      const completed = await completedDay(sql)

      if (!completed || completed < day)
        return retry

      const value = await operation()

      // In particular, never forward a login cookie created across midnight.
      // Its session will be revoked by the next reset; the caller can retry.
      if (await demoDay(sql) > day)
        throw new Error('Demo boundary crossed during request; retry')

      return value
    })

    if (result !== retry)
      return result as T
  }
}
