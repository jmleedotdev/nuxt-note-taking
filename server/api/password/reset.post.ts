import { resetPasswordSchema } from '../../../shared/schemas/password-recovery'
import { authInput, checkAuthOrigin } from '../../auth/http'
import { authClientIP, consumeAuthLimit } from '../../auth/limits'
import { authService } from '../../auth/service'

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

    // Use the pinned library's cookie names/attributes, including secure prefixes.
    for (const cookie of Object.values(service.cookies)) {
      const attributes = {
        path: cookie.attributes.path,
        domain: cookie.attributes.domain,
        secure: cookie.attributes.secure,
        httpOnly: true,
        sameSite: 'lax' as const,
      }

      deleteCookie(event, cookie.name, attributes)

      for (const name of Object.keys(parseCookies(event))) {
        if (name.startsWith(`${cookie.name}.`))
          deleteCookie(event, name, attributes)
      }
    }

    return { status: 'password-reset' }
  } catch {
    setResponseStatus(event, 503)

    return {
      error: { code: 'AUTH_UNAVAILABLE' },
    }
  }
})
