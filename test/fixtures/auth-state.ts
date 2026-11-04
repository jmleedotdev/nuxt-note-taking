import { defineEventHandler, readBody } from 'h3'
import { registrationService } from '../../server/registration/service'

// Test-only clock/state setup; never mounted by runtime Nuxt configuration.
export default defineEventHandler(async (event) => {
  const { email, ageSeconds, unverify, expire } = await readBody(event)
  const { client } = registrationService()

  if (typeof ageSeconds === 'number') {
    await client`
      UPDATE session SET created_at = now() - ${ageSeconds} * interval '1 second'
      WHERE user_id IN (SELECT id FROM "user" WHERE email = ${email})
    `
  }

  if (expire === true) {
    await client`UPDATE session SET expires_at = now() - interval '1 second' WHERE user_id IN (SELECT id FROM "user" WHERE email = ${email})`
  }

  if (unverify === true) {
    await client`UPDATE "user" SET email_verified = false WHERE email = ${email}`
  }

  return { status: 'configured' }
})
