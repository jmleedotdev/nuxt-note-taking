import { registrationSchema } from '../../shared/schemas/registration'
import { admitAuth } from '../auth/http'

export default defineEventHandler(async (event) => {
  const admission = await admitAuth(event, registrationSchema)

  if ('response' in admission) {
    return admission.response
  }

  try {
    await admission.service.register(admission.data.email, admission.data.password, admission.headers)
  } catch {
    // No library errors, hashes, request bodies, or account records cross this boundary.
    setResponseStatus(event, 503)

    return {
      error: { code: 'REGISTRATION_UNAVAILABLE' },
    }
  }

  setResponseStatus(event, 202)

  return { status: 'check-email', resendAfter: 30 }
})
