import { loginSchema } from '../../shared/schemas/registration'
import { forwardAuthCookies } from '../authentication/session'
import { admitRegistration } from '../registration/http'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  try {
    const admitted = await admitRegistration(event, loginSchema, 'login')

    if ('response' in admitted)
      return admitted.response

    const response = await admitted.service.login(admitted.data.email, admitted.data.password, admitted.headers)

    forwardAuthCookies(event, response)

    if (response.ok)
      return { status: 'signed-in' }

    const failure = await response.json()
    const unverified = failure.code === 'EMAIL_NOT_VERIFIED'

    setResponseStatus(event, unverified
      ? 403
      : response.status === 401
        ? 401
        : 503)

    return {
      error: {
        code: unverified
          ? 'EMAIL_NOT_VERIFIED'
          : response.status === 401
            ? 'INVALID_CREDENTIALS'
            : 'AUTH_UNAVAILABLE',
      },
    }
  } catch {
    setResponseStatus(event, 503)

    return {
      error: { code: 'AUTH_UNAVAILABLE' },
    }
  }
})
