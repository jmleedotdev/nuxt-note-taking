import { forgotPasswordSchema } from '../../../shared/schemas/password-recovery'
import { admitAuth } from '../../auth/http'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  try {
    const admission = await admitAuth(event, forgotPasswordSchema, 'forgot')

    if ('response' in admission)
      return admission.response

    const dispatch = await admission.service.recovery.issue(admission.data.email)

    event.waitUntil(dispatch.deliver().catch(() => {
      console.warn('Password recovery mail submission failed')
    }))
    setResponseStatus(event, 202)

    return { status: 'check-email', resendAfter: 30 }
  } catch {
    setResponseStatus(event, 503)

    return {
      error: { code: 'AUTH_UNAVAILABLE' },
    }
  }
})
