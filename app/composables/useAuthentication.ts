import type { AuthenticatedSession } from '#shared/authentication'

export function useAuthentication() {
  const session = useState<AuthenticatedSession | null>('authenticated-session', () => null)
  const request = useRequestFetch()
  const event = useRequestEvent()

  async function refresh() {
    let status = 503

    const result = await request<AuthenticatedSession>('/api/session', {
      ignoreResponseError: true,
      onResponse({ response }) {
        status = response.status

        if (import.meta.server && event) {
          for (const cookie of response.headers.getSetCookie()) {
            event.node.res.appendHeader('set-cookie', cookie)
          }
        }
      },
    })

    session.value = status === 200
      ? result
      : null

    if (status >= 500)
      throw createError({ statusCode: 503, message: 'Unable to check your session. Please try again.' })

    return status
  }

  async function login(email: string, password: string) {
    const response = await $fetch.raw('/api/login', {
      method: 'POST',
      body: { email, password },
      ignoreResponseError: true,
    })

    return response.status
  }

  async function logout() {
    await $fetch('/api/logout', { method: 'POST', body: {} })
    session.value = null
  }

  return { session, refresh, login, logout }
}
