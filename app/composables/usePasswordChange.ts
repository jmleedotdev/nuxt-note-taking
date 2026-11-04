export function usePasswordChange() {
  const authentication = useAuthentication()

  async function change(currentPassword: string, newPassword: string, confirmation: string) {
    const response = await $fetch.raw('/api/password/change', {
      method: 'POST',
      body: { currentPassword, newPassword, confirmation },
      ignoreResponseError: true,
    })

    if (response.status === 200 || response.status === 401) {
      authentication.clearLocalSession()
      clearNuxtData()
    }

    return response.status
  }

  return { change }
}
