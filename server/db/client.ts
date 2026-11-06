import { drizzle } from 'drizzle-orm/postgres-js'
import { authConfig } from '../auth/config'
import { databaseConnection } from './connection'

export function createDatabase() {
  const client = databaseConnection(authConfig().DATABASE_URL)

  return {
    client,
    db: drizzle(client),
  }
}
