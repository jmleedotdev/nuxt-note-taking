export function usePasswordRecovery() {
  async function request(email: string) {
    return $fetch.raw<{ resendAfter?: number, retryAfter?: number }>('/api/password/forgot', {
      method: 'POST',
      body: { email },
      ignoreResponseError: true,
    })
  }

  async function reset(token: string, newPassword: string, confirmation: string) {
    const response = await $fetch.raw('/api/password/reset', {
      method: 'POST',
      body: { token, newPassword, confirmation },
      ignoreResponseError: true,
    })

    if (response.status === 200) {
      useAuthentication().session.value = null
      useAppearance().leaveAccount()
    }

    return response.status
  }

  return { request, reset }
}
