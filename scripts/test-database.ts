import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

// Explicit environment values (including CI) take precedence; never load the app .env.
if (!process.env.DATABASE_URL && existsSync('.env.test.local')) {
  process.loadEnvFile('.env.test.local')
}

// This connection must be to a disposable local/test PostgreSQL cluster with CREATEDB.
const adminURL = process.env.DATABASE_URL

if (!adminURL) {
  throw new Error('Set DATABASE_URL directly or in .env.test.local to an isolated PostgreSQL cluster')
}

const admin = postgres(adminURL, {
  max: 1,
  onnotice: () => {},
})
const name = `notes_test_${randomBytes(8).toString('hex')}`
const url = new URL(adminURL)

url.pathname = `/${name}`

let code = 1

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

  const args = process.argv.slice(2)

  code = await new Promise<number>((resolve, reject) => {
    const child = spawn('pnpm', args.length
      ? args
      : ['exec', 'vitest', 'run'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: url.href,
        APP_TRUSTED_PROXY_IP: '127.0.0.1',
        APP_ENV: 'test',
        MAIL_MODE: 'memory',
        APP_URL: process.env.APP_TEST_ORIGIN ?? 'http://localhost:3000',
        APP_AUTH_SECRET: 'isolated-registration-tests-secret-32-characters',
      },
    })

    child.once('error', reject)
    child.once('exit', value => resolve(value ?? 1))
  })
} finally {
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await admin.end()
}

process.exitCode = code
