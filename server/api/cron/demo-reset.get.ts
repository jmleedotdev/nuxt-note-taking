import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { authConfig } from '../../auth/config'
import { ensureDemoDay } from '../../demo/lifecycle'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  const secret = process.env.CRON_SECRET
  const supplied = Buffer.from(getHeader(event, 'authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret ?? ''}`)

  // Authenticate before entering the lifecycle, even when configuration is absent.
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    setResponseStatus(event, 401)

    return {
      error: { code: 'UNAUTHORIZED' },
    }
  }

  if (authConfig().APP_ENV !== 'demo') {
    setResponseStatus(event, 403)

    return {
      error: { code: 'DEMO_ONLY' },
    }
  }

  try {
    await ensureDemoDay()

    return { ok: true }
  } catch {
    setResponseStatus(event, 503)

    return {
      error: { code: 'TEMPORARILY_UNAVAILABLE' },
    }
  }
})
