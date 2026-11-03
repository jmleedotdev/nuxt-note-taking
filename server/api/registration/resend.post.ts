import { resendSchema } from '../../../shared/schemas/registration'
import { admitRegistration } from '../../registration/http'

export default defineEventHandler(async (event) => {
  const admission = await admitRegistration(event, resendSchema)

  if ('response' in admission) {
    return admission.response
  }

  // Track resend work after responding to reduce account-existence timing signals.
  event.waitUntil(admission.service.resend(admission.data.email, admission.headers)
    .catch(() => {
      console.warn('Verification recovery submission failed')
    }))
  setResponseStatus(event, 202)

  return { status: 'check-email', resendAfter: 30 }
})
