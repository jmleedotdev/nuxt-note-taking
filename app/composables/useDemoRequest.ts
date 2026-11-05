// Protected demo requests discover daily expiration even when the browser has
// been idle in an editor. Ordinary account/session behavior stays unchanged.
export function useDemoRequest() {
  const request = useRequestFetch()
  const demo = useDemo()
  const nuxt = useNuxtApp()
  const dirty = useState('note-dirty', () => false)
  const pending = useState('note-save-pending', () => false)

  // Nitro's request-local fetch forwards SSR cookies but has no create method.
  if (import.meta.server)
    return request

  return $fetch.create({
    async onResponse({ response }) {
      if (!import.meta.client || !demo.value || response.status !== 401)
        return

      await nuxt.runWithContext(async () => {
        useAuthentication().clearLocalSession()
        // Expiration is not a user-requested navigation. Never offer to save
        // yesterday's draft or let its discard/pending guard retain authority.
        dirty.value = false
        pending.value = false
        clearNuxtData(key => key === 'active-notes' || key === 'archived-notes' || key.startsWith('note-'))
        await navigateTo('/login', { replace: true })
      })
    },
  })
}
