import { defineEventHandler, readBody } from 'h3'
import { databaseConnection } from '../../server/db/connection'
import { ensureDemoDay } from '../../server/demo/lifecycle'

// Keep the test clock controllable while race tests block the auth adapter.
// This separate connection is never included in normal builds.
const clock = databaseConnection(process.env.DATABASE_URL!)

// Mounted only by disposable demo test configurations.
export default defineEventHandler(async (event) => {
  const { now, reset, advanceDay } = await readBody(event)

  if (now)
    await clock`UPDATE test_demo_clock SET instant = ${now}`

  if (advanceDay)
    await clock`UPDATE test_demo_clock SET instant = instant + interval '1 day'`

  if (reset)
    await ensureDemoDay()

  return { status: 'configured' }
})
