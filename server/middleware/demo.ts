import { authConfig } from '../auth/config'

const restrictedPaths = new Set([
  '/api/registration',
  '/api/registration/resend',
  '/api/registration/verify',
  '/api/password/forgot',
  '/api/password/reset',
  '/api/password/change',
])

export default defineEventHandler((event) => {
  if (authConfig().APP_ENV !== 'demo')
    return

  // Block before parsing tokens or entering auth handlers, regardless of method.
  const path = getRequestURL(event).pathname.replace(/\/+$/, '').toLowerCase()

  if (restrictedPaths.has(path)) {
    setHeader(event, 'Cache-Control', 'no-store')
    setResponseStatus(event, 403)

    return {
      error: { code: 'DEMO_RESTRICTED' },
    }
  }
})
