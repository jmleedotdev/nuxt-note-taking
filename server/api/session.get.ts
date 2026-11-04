import { isError } from 'h3'
import { requireVerifiedSession } from '../auth/session'

export default defineEventHandler(async (event) => {
  try {
    return await requireVerifiedSession(event)
  } catch (error) {
    if (isError(error) && [401, 403].includes(error.statusCode)) {
      setResponseStatus(event, error.statusCode)

      return {
        error: {
          code: error.statusCode === 401
            ? 'UNAUTHENTICATED'
            : 'EMAIL_NOT_VERIFIED',
        },
      }
    }

    setResponseStatus(event, 503)

    return {
      error: { code: 'AUTH_UNAVAILABLE' },
    }
  }
})
