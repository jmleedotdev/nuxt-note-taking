import { appearanceSchema } from '#shared/schemas/preferences'

export default defineNuxtPlugin((nuxtApp) => {
  const appearance = useAppearance()
  const colorMode = useColorMode()

  useHead(() => ({
    htmlAttrs: { 'data-font': appearance.applied.value.font },
  }))

  if (import.meta.client) {
    function reconcile() {
      if (appearanceSchema.safeParse(appearance.remembered.value).success)
        colorMode.preference = appearance.applied.value.theme
    }

    reconcile()
    // Color mode resolves its SSR “unknown” state at mount; account values win afterwards.
    nuxtApp.hook('app:mounted', reconcile)

    watch(appearance.applied, value => colorMode.preference = value.theme, { flush: 'sync' })
  }
})
