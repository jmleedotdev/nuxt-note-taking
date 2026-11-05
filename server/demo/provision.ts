import type { Sql } from 'postgres'
import { passwordSchema } from '../../shared/schemas/registration'
import { hashPassword, verifyPassword } from '../auth/password'
import { demoAccounts } from './accounts'

const samples = [
  [
    {
      title: 'A weekend outdoors',
      content: 'Pack a water bottle and explore a nearby trail.\n\nLeave time to enjoy the view.',
      tags: ['Outdoors', 'Weekend'],
    },
    {
      title: 'Reading list',
      content: 'Collect a few books to read this season.\nAdd your own recommendations.',
      tags: ['Books'],
    },
    {
      title: 'Small daily habits',
      content: 'Take a short walk.\nWrite down one thing you learned.',
      tags: ['Habits'],
    },
  ],
  [
    {
      title: 'Story ideas',
      content: 'A visitor finds a handwritten map inside a library book.\n\nWhat happens next?',
      tags: ['Writing', 'Ideas'],
    },
    {
      title: 'Kitchen experiments',
      content: 'Try roasting seasonal vegetables with herbs.\nKeep notes on your favourite combinations.',
      tags: ['Cooking'],
    },
    {
      title: 'Project sketchbook',
      content: 'Choose one small idea.\nBuild a first version, then reflect on what worked.',
      tags: ['Projects', 'Ideas'],
    },
  ],
]

// Create-only, atomic provisioning. Never restore samples or preferences for an
// existing account: visitors' edits belong to the later daily-reset lifecycle.
export async function provisionDemo(client: Sql, passwords: string[]) {
  if (passwords.length !== 2)
    throw new Error('Provide exactly two demo passwords')

  passwords.forEach(password => passwordSchema.parse(password))

  await client.begin(async (sql) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended('portfolio-demo-provision', 0))`

    for (const [index, designated] of demoAccounts.entries()) {
      const existing = await sql`SELECT id, email, email_verified FROM "user" WHERE id = ${designated.id} OR lower(email) = ${designated.email}`

      if (existing.length) {
        const user = existing[0]!
        const credentials = await sql`SELECT password FROM account WHERE user_id = ${designated.id} AND provider_id = 'credential'`

        if (existing.length !== 1 || user.id !== designated.id || user.email !== designated.email || !user.email_verified
          || credentials.length !== 1 || !credentials[0]!.password
          || !await verifyPassword({ hash: credentials[0]!.password, password: passwords[index]! })) {
          throw new Error('Demo identity collision or credential drift; no data was changed')
        }

        continue
      }

      const hash = await hashPassword(passwords[index]!)

      await sql`INSERT INTO "user" (id, name, email, email_verified) VALUES (${designated.id}, 'Demo visitor', ${designated.email}, true)`
      await sql`INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES (${designated.id}, ${designated.id}, 'credential', ${designated.id}, ${hash})`
      await sql`INSERT INTO appearance_preferences (owner_id) VALUES (${designated.id})`

      for (const note of samples[index]!) {
        await sql`INSERT INTO notes (owner_id, title, content, tags) VALUES (${designated.id}, ${note.title}, ${note.content}, ${note.tags})`
      }
    }
  })
}
