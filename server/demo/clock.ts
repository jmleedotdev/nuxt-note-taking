import type { Sql, TransactionSql } from 'postgres'

export async function demoDay(sql: Sql | TransactionSql) {
  const [row] = await sql`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day`

  return row!.day as string
}
