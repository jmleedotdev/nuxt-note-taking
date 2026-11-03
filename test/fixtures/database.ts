import { randomBytes } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

// Plan during collection, create only in beforeAll: filtered tests must not leak databases.
export function isolatedHTTPDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '')

  if (!url.pathname.startsWith('/notes_test_')) {
    throw new Error('Run through scripts/test-database.ts')
  }

  const admin = postgres(url.href, {
    max: 1,
    onnotice: () => {},
  })
  const name = `notes_test_${randomBytes(8).toString('hex')}`

  url.pathname = `/${name}`

  async function dispose() {
    try {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    } finally {
      await admin.end()
    }
  }

  return {
    url: url.href,
    dispose,
    async prepare() {
      try {
        await admin.unsafe(`CREATE DATABASE "${name}"`)

        const client = postgres(url.href, {
          max: 1,
          onnotice: () => {},
        })

        try {
          await migrate(drizzle(client), { migrationsFolder: 'drizzle' })
        } finally {
          await client.end()
        }
      } catch (error) {
        await dispose()
        throw error
      }
    },
  }
}
