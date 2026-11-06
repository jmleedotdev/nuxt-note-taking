import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'

export async function demoDay(db: PostgresJsDatabase) {
  const [row] = await db.execute(sql`SELECT to_char(instant AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day FROM test_demo_clock`)

  return row!.day as string
}
