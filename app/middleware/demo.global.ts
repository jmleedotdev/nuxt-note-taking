export default defineNuxtRouteMiddleware((to) => {
  if (useDemo().value && [
    '/signup',
    '/check-email',
    '/forgot-password',
    '/reset-password',
  ].includes(to.path.replace(/\/+$/, ''))) {
    return navigateTo('/login', { replace: true })
  }
})
