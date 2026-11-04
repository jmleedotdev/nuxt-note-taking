import { checkAuthOrigin } from '../auth/http'
import { authService } from '../auth/service'
import { forwardAuthCookies } from '../auth/session'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  if (!checkAuthOrigin(event)) {
    setResponseStatus(event, 403)

    return {
      error: { code: 'FORBIDDEN_ORIGIN' },
    }
  }

  try {
    const response = await authService().logout(new Headers(getRequestHeaders(event) as HeadersInit))

    forwardAuthCookies(event, response)

    if (response.ok)
      return { status: 'signed-out' }
  } catch { /* Do not claim logout succeeded if authoritative revocation failed. */ }

  setResponseStatus(event, 503)

  return {
    error: { code: 'AUTH_UNAVAILABLE' },
  }
})
