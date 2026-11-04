import { z } from 'zod'
import { authService } from '../../auth/service'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Referrer-Policy', 'no-referrer')

  const token = z.string().min(1).max(2048).safeParse(getQuery(event).token)

  if (token.success) {
    try {
      await authService().verify(token.data, new Headers(getRequestHeaders(event) as HeadersInit))

      return sendRedirect(event, '/login?verified=1', 303)
    } catch { /* Invalid/expired links have the same recovery path; never reflect the token. */ }
  }

  return sendRedirect(event, '/check-email?invalid=1', 303)
})
