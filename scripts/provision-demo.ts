import { databaseConnection } from '../server/db/connection'
import { provisionDemo } from '../server/demo/provision'

// Do not load .env automatically: the operator must explicitly select the target.
const target = process.env.DATABASE_URL
const args = process.argv.slice(2)

if (process.env.APP_ENV !== 'demo' || !target
  || args.length !== 2 || args[0] !== '--confirm-database'
  || args[1] !== decodeURIComponent(new URL(target).pathname.slice(1))) {
  throw new Error('Set APP_ENV=demo and DATABASE_URL explicitly; pass --confirm-database with the exact database name')
}

const client = databaseConnection(target, 1)

try {
  await provisionDemo(client, [process.env.DEMO_PASSWORD_1 ?? '', process.env.DEMO_PASSWORD_2 ?? ''])
  console.info('Demo accounts provisioned; existing visitor data preserved')
} finally {
  await client.end()
}
