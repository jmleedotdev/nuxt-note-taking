import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { authConfig } from '../auth/config'

export function createDatabase() {
  const client = postgres(authConfig().DATABASE_URL)

  return {
    client,
    db: drizzle(client),
  }
}
