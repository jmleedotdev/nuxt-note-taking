import { forwardAuthCookies } from '../authentication/session'
import { checkRegistrationOrigin } from '../registration/http'
import { registrationService } from '../registration/service'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  if (!checkRegistrationOrigin(event)) {
    setResponseStatus(event, 403)

    return {
      error: { code: 'FORBIDDEN_ORIGIN' },
    }
  }

  try {
    const response = await registrationService().logout(new Headers(getRequestHeaders(event) as HeadersInit))

    forwardAuthCookies(event, response)

    if (response.ok)
      return { status: 'signed-out' }
  } catch { /* Do not claim logout succeeded if authoritative revocation failed. */ }

  setResponseStatus(event, 503)

  return {
    error: { code: 'AUTH_UNAVAILABLE' },
  }
})
