import type { Sql, TransactionSql } from 'postgres'

// Replaces the production clock only in explicitly configured test builds.
export async function demoDay(sql: Sql | TransactionSql) {
  const [row] = await sql`SELECT to_char(instant AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day FROM test_demo_clock`

  return row!.day as string
}
