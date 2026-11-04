import { isError } from 'h3'
import { changePasswordSchema } from '../../../shared/schemas/password-change'
import { authInput, checkAuthOrigin } from '../../auth/http'
import { authClientIP, consumeAuthLimit } from '../../auth/limits'
import { authService } from '../../auth/service'
import { clearAuthCookies, requireVerifiedSession } from '../../auth/session'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  if (!checkAuthOrigin(event)) {
    setResponseStatus(event, 403)

    return {
      error: { code: 'FORBIDDEN_ORIGIN' },
    }
  }

  try {
    const session = await requireVerifiedSession(event)
    const parsed = await authInput(event, changePasswordSchema)

    if ('error' in parsed)
      return parsed

    const service = authService()
    const retryAfter = await consumeAuthLimit(service, authClientIP(event, service), session.user.email, 'change')

    if (retryAfter) {
      setResponseStatus(event, 429)
      setHeader(event, 'Retry-After', retryAfter)

      return {
        error: { code: 'RATE_LIMITED' },
        retryAfter,
      }
    }

    const result = await service.changePassword(
      session.user.email,
      parsed.data.currentPassword,
      parsed.data.newPassword,
      new Headers(getRequestHeaders(event) as HeadersInit),
    )

    if (result !== 'password-changed') {
      setResponseStatus(event, result === 'UNAUTHENTICATED'
        ? 401
        : result === 'EMAIL_NOT_VERIFIED'
          ? 403
          : 400)

      return {
        error: { code: result },
      }
    }

    clearAuthCookies(event)

    return { status: 'password-changed' }
  } catch (error) {
    const status = isError(error) && [401, 403].includes(error.statusCode)
      ? error.statusCode
      : 503

    setResponseStatus(event, status)

    return {
      error: {
        code: status === 401
          ? 'UNAUTHENTICATED'
          : status === 403
            ? 'EMAIL_NOT_VERIFIED'
            : 'AUTH_UNAVAILABLE',
      },
    }
  }
})
