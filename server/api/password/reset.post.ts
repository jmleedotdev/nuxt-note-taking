import { resetPasswordSchema } from '../../../shared/schemas/password-recovery'
import { authInput, checkAuthOrigin } from '../../auth/http'
import { authClientIP, consumeAuthLimit } from '../../auth/limits'
import { authService } from '../../auth/service'
import { clearAuthCookies } from '../../auth/session'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  if (!checkAuthOrigin(event)) {
    setResponseStatus(event, 403)

    return {
      error: { code: 'FORBIDDEN_ORIGIN' },
    }
  }

  try {
    const parsed = await authInput(event, resetPasswordSchema)

    if ('error' in parsed)
      return parsed

    const service = authService()
    const subject = await service.recovery.subject(parsed.data.token)
    const retryAfter = await consumeAuthLimit(service, authClientIP(event, service), subject ?? parsed.data.token, 'reset')

    if (retryAfter) {
      setResponseStatus(event, 429)
      setHeader(event, 'Retry-After', retryAfter)

      return {
        error: { code: 'RATE_LIMITED' },
        retryAfter,
      }
    }

    if (!await service.recovery.redeem(parsed.data.token, parsed.data.newPassword)) {
      setResponseStatus(event, 400)

      return {
        error: { code: 'INVALID_RESET_LINK' },
      }
    }

    clearAuthCookies(event)

    return { status: 'password-reset' }
  } catch {
    setResponseStatus(event, 503)

    return {
      error: { code: 'AUTH_UNAVAILABLE' },
    }
  }
})
