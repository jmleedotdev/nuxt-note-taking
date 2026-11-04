import type { H3Event } from 'h3'
import { registrationService } from '../registration/service'

export function forwardAuthCookies(event: H3Event, response: Response) {
  for (const cookie of response.headers.getSetCookie()) {
    appendResponseHeader(event, 'set-cookie', cookie)
  }
}

export async function requireVerifiedSession(event: H3Event): Promise<AuthenticatedSession> {
  setHeader(event, 'Cache-Control', 'no-store')

  const response = await registrationService().session(new Headers(getRequestHeaders(event) as HeadersInit))

  forwardAuthCookies(event, response)

  if (!response.ok) {
    throw createError({
      statusCode: 503,
      data: {
        error: { code: 'AUTH_UNAVAILABLE' },
      },
    })
  }

  const result = await response.json()

  if (result && Date.now() >= new Date(result.session.createdAt).getTime() + 604800000) {
    const revoked = await registrationService().logout(new Headers(getRequestHeaders(event) as HeadersInit))

    forwardAuthCookies(event, revoked)
    throw createError({
      statusCode: 401,
      data: {
        error: { code: 'UNAUTHENTICATED' },
      },
    })
  }

  if (!result) {
    throw createError({
      statusCode: 401,
      data: {
        error: { code: 'UNAUTHENTICATED' },
      },
    })
  }

  if (!result.user.emailVerified) {
    throw createError({
      statusCode: 403,
      data: {
        error: { code: 'EMAIL_NOT_VERIFIED' },
      },
    })
  }

  return {
    user: { id: result.user.id, email: result.user.email },
    expiresAt: new Date(result.session.expiresAt).toISOString(),
  }
}
