import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { demoDay } from '#demo-clock'
import { authConfig } from '../auth/config'
import { notes } from '../db/schema/notes'
import { demoAccounts } from './accounts'
import { demoSamples } from './baseline'

const access = new AsyncLocalStorage<PostgresJsDatabase>()

// Demo services must use the very transaction holding the lifecycle lock. A
// severed connection then aborts writes as well as releasing coordination.
export function demoDatabase() {
  if (authConfig().APP_ENV !== 'demo')
    return undefined

  const db = access.getStore()

  if (!db)
    throw new Error('Demo data access requires lifecycle coordination')

  return db
}

// Lock waiters cannot use the pool needed by the lock holder's auth adapter.
// Transaction-scoped advisory locks also work through transaction poolers.
let coordination: ReturnType<typeof postgres> | undefined

function lifecycleDatabase() {
  coordination ??= postgres(authConfig().DATABASE_URL, { max: 5 })

  return drizzle(coordination)
}

async function lock(tx: PostgresJsDatabase) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('portfolio-demo-lifecycle', 0))`)
}

async function completedDay(tx: PostgresJsDatabase) {
  const [row] = await tx.execute(sql`SELECT completed_day FROM demo_lifecycle WHERE id = 'daily'`)

  return row?.completed_day as string | undefined
}

// Shared by request-time enforcement and the later authenticated scheduler.
// No public/manual-reset endpoint: a completed day is never replayed.
export async function ensureDemoDay() {
  if (authConfig().APP_ENV !== 'demo')
    throw new Error('Daily reset is only available in demo mode')

  await lifecycleDatabase().transaction(async (tx) => {
    await lock(tx)

    const day = await demoDay(tx)
    const completed = await completedDay(tx)

    if (completed && completed >= day)
      return

    // Validate both identities before changing anything; never adopt unrelated data.
    for (const account of demoAccounts) {
      const rows = await tx.execute(sql`SELECT id FROM "user" WHERE id = ${account.id} AND email = ${account.email} AND email_verified = true`)

      if (rows.length !== 1)
        throw new Error('Demo baseline identities are not provisioned')
    }

    for (const [index, account] of demoAccounts.entries()) {
      await tx.execute(sql`DELETE FROM session WHERE user_id = ${account.id}`)
      await tx.execute(sql`DELETE FROM notes WHERE owner_id = ${account.id}`)
      await tx.execute(sql`DELETE FROM appearance_preferences WHERE owner_id = ${account.id}`)
      await tx.execute(sql`INSERT INTO appearance_preferences (owner_id) VALUES (${account.id})`)
      await tx.insert(notes).values(demoSamples[index]!.map(note => ({ ...note, ownerId: account.id })))
    }

    await tx.execute(sql`INSERT INTO demo_lifecycle (id, completed_day) VALUES ('daily', ${day}) ON CONFLICT (id) DO UPDATE SET completed_day = EXCLUDED.completed_day`)
  })
}

// Commit restoration BEFORE accessing the baseline. Then reacquire the same
// lock and recheck the day: midnight or another instance may have intervened.
// Hold it through authorization AND the full operation. Demo reads/writes use
// this same transaction via request-local context, so connection loss cannot
// leave an independent stale mutation running after the lock is released.
// Auth uses its adapter pool, but no login cookie is forwarded before commit.
export async function withDemoAccess<T>(operation: () => Promise<T>): Promise<T> {
  if (authConfig().APP_ENV !== 'demo')
    return operation()

  const retry = Symbol('boundary crossed')

  while (true) {
    await ensureDemoDay()

    const result = await lifecycleDatabase().transaction(async (tx) => {
      await lock(tx)

      const day = await demoDay(tx)
      const completed = await completedDay(tx)

      if (!completed || completed < day)
        return retry

      const value = await access.run(tx, operation)

      // Never forward a login cookie created across midnight; data writes in
      // this transaction also roll back. The next request restores the day.
      if (await demoDay(tx) > day)
        throw new Error('Demo boundary crossed during request; retry')

      return value
    })

    if (result !== retry)
      return result as T
  }
}
