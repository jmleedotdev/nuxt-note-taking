import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'

export async function demoDay(db: PostgresJsDatabase) {
  const [row] = await db.execute(sql`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day`)

  return row!.day as string
}
