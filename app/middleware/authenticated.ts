export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server)
    useResponseHeader('Cache-Control').value = 'no-store'

  const status = await useAuthentication().refresh()

  if (status === 401)
    return navigateTo('/login', { replace: true })

  if (status === 403)
    return navigateTo('/check-email?required=1', { replace: true })
})
