import { defineEventHandler, readBody } from 'h3'
import { authService } from '../../server/auth/service'
import { ensureDemoDay } from '../../server/demo/lifecycle'

// Mounted only by disposable demo test configurations.
export default defineEventHandler(async (event) => {
  const { now, reset, advanceDay } = await readBody(event)

  if (now)
    await authService().client`UPDATE test_demo_clock SET instant = ${now}`

  if (advanceDay)
    await authService().client`UPDATE test_demo_clock SET instant = instant + interval '1 day'`

  if (reset)
    await ensureDemoDay()

  return { status: 'configured' }
})
