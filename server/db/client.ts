import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { registrationConfig } from '../registration/config'

export function createDatabase() {
  const client = postgres(registrationConfig().DATABASE_URL)

  return {
    client,
    db: drizzle(client),
  }
}
