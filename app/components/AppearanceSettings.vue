<script setup lang="ts">
import type { Appearance } from '#shared/schemas/preferences'
import { appearanceSchema } from '#shared/schemas/preferences'

defineEmits<{ logout: [] }>()

const route = useRoute()
const appearance = useAppearance()
const authentication = useAuthentication()
const section = computed(() => route.query.setting === 'password'
  ? 'password'
  : route.query.setting === 'font'
    ? 'font'
    : 'color')
const explicitSection = computed(() => !!route.query.setting)
const state = reactive<Appearance>({ ...appearance.applied.value })
const message = ref('')
const error = ref('')
const validation = ref('')
const accountChanged = ref(false)
const title = computed(() => section.value === 'font'
  ? 'Font Theme'
  : 'Color Theme')
const themes = [
  {
    value: 'light',
    label: 'Light Mode',
    description: 'Pick a clean and classic light theme',
    icon: 'i-app-sun',
  },
  {
    value: 'dark',
    label: 'Dark Mode',
    description: 'Select a sleek and modern dark theme',
    icon: 'i-app-moon',
  },
  {
    value: 'system',
    label: 'System',
    description: 'Adapts to your device’s theme',
    icon: 'i-app-system-theme',
  },
]
const fonts = [
  {
    value: 'inter',
    label: 'Sans-serif (Inter)',
    description: 'Clean and modern, easy to read.',
    icon: 'i-app-font-sans-serif',
  },
  {
    value: 'noto-serif',
    label: 'Serif (Noto Serif)',
    description: 'Classic and elegant for a timeless feel.',
    icon: 'i-app-font-serif',
  },
  {
    value: 'source-code-pro',
    label: 'Monospace (Source Code Pro)',
    description: 'Code-like, great for a technical vibe.',
    icon: 'i-app-font-monospace',
  },
]

watch([appearance.applied, section], () => {
  Object.assign(state, appearance.applied.value)
  message.value = ''
  error.value = ''
  validation.value = ''
  accountChanged.value = false
})

async function retry() {
  try {
    const status = await authentication.refresh()

    if (status === 401 || status === 403) {
      await navigateTo(status === 401
        ? '/login'
        : '/check-email?required=1')

      return
    }

    const ownerId = authentication.session.value?.user.id

    if (ownerId)
      await appearance.load(ownerId, true)
  } catch {
    // Keep the visible retry state if the session service is also unavailable.
  }
}

async function submit() {
  message.value = ''
  error.value = ''

  const parsed = appearanceSchema.safeParse(state)

  if (!parsed.success) {
    validation.value = 'Choose one of the available theme and font options.'

    return
  }

  validation.value = ''

  try {
    await appearance.save(parsed.data)
    message.value = 'Appearance saved to your account.'
  } catch (cause) {
    const failure = cause as { data?: { error?: { code?: string } } }

    if (failure.data?.error?.code === 'ACCOUNT_CHANGED') {
      accountChanged.value = true
      error.value = 'Your signed-in account changed in another tab. Reload the account before making changes.'

      return
    }

    error.value = failure.data?.error?.code === 'VALIDATION'
      ? 'These options could not be saved. Choose an available option and try again.'
      : 'We could not save your appearance. Your choices are still here. Please try again.'
  }
}
</script>

<template>
  <div class="xl:flex xl:min-h-[calc(100dvh-5rem)]">
    <nav aria-label="Settings sections" class="space-y-2 xl:w-64.5 xl:shrink-0 xl:border-r xl:border-neutral-200 xl:py-5 xl:pr-4 xl:pl-8 dark:xl:border-neutral-800" :class="explicitSection ? 'hidden xl:block' : ''">
      <UButton to="/?panel=settings&setting=color" icon="i-app-sun" color="neutral" variant="ghost" block class="justify-start" :class="section === 'color' && 'xl:bg-neutral-100 dark:xl:bg-neutral-800'" :aria-current="explicitSection && section === 'color' ? 'page' : undefined" :disabled="appearance.saving.value">
        Color Theme
        <UIcon name="i-app-chevron-right" class="ml-auto size-3" />
      </UButton>

      <UButton to="/?panel=settings&setting=font" icon="i-app-font" color="neutral" variant="ghost" block class="justify-start" :class="section === 'font' && 'xl:bg-neutral-100 dark:xl:bg-neutral-800'" :aria-current="section === 'font' ? 'page' : undefined" :disabled="appearance.saving.value">
        Font Theme
        <UIcon name="i-app-chevron-right" class="ml-auto size-3" />
      </UButton>

      <UButton to="/?panel=settings&setting=password" icon="i-app-lock" color="neutral" variant="ghost" block class="justify-start" :class="section === 'password' && 'xl:bg-neutral-100 dark:xl:bg-neutral-800'" :aria-current="section === 'password' ? 'page' : undefined" :ui="{ leadingIcon: section === 'password' ? 'dark:text-blue-500' : undefined }" :disabled="appearance.saving.value">
        Change Password
        <UIcon name="i-app-chevron-right" class="ml-auto size-3" />
      </UButton>

      <div class="border-t border-neutral-200 pt-2 dark:border-neutral-800">
        <UButton icon="i-app-logout" color="neutral" variant="ghost" :disabled="appearance.saving.value" @click="$emit('logout')">
          Log out
        </UButton>
      </div>
    </nav>

    <section class="min-w-0 flex-1 xl:p-8" :class="!explicitSection && 'hidden xl:block'">
      <div :class="section === 'password' ? 'xl:max-w-132' : 'max-w-132'">
        <UButton to="/?panel=settings" icon="i-app-arrow-left" color="neutral" variant="ghost" class="px-0 py-0 xl:hidden" :class="section === 'password' ? 'mb-3' : 'mb-4'" :disabled="appearance.saving.value">
          Settings
        </UButton>

        <PasswordSettings v-if="section === 'password'" />

        <template v-else>
          <h2 class="text-2xl font-bold tracking-tight xl:text-base xl:font-semibold">
            {{ title }}
          </h2>

          <p class="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
            Choose your {{ section === 'font' ? 'font' : 'color' }} theme:
          </p>

          <p v-if="appearance.status.value === 'loading'" role="status" class="mt-6 text-sm">
            Loading your account appearance…
          </p>

          <div v-else-if="appearance.status.value === 'error'" role="alert" class="mt-6 space-y-3 text-sm">
            <p>We could not load your account appearance. Try again before making changes.</p>

            <UButton color="neutral" variant="outline" @click="retry">
              Try again
            </UButton>
          </div>

          <form v-else class="mt-6 space-y-6" @submit.prevent="submit">
            <URadioGroup
              :key="section"
              v-model="state[section === 'font' ? 'font' : 'theme']"
              :items="section === 'font' ? fonts : themes"
              :aria-label="title"
              variant="card"
              indicator="end"
              :disabled="accountChanged || appearance.saving.value || appearance.status.value !== 'ready'"
              :ui="{
                fieldset: 'gap-4',
                item: 'relative min-h-18 items-center rounded-xl border-neutral-200 p-4 has-data-[state=checked]:border-neutral-200 has-data-[state=checked]:bg-neutral-100 has-focus-visible:outline-2 has-focus-visible:outline-blue-500 dark:border-neutral-800 dark:has-data-[state=checked]:border-neutral-800 dark:has-data-[state=checked]:bg-neutral-800',
                wrapper: 'mr-4 pl-14',
                label: 'text-sm leading-[1.2] font-medium text-neutral-950 dark:text-neutral-0',
                description: 'mt-1.5 text-xs leading-[1.2] text-neutral-700 dark:text-neutral-300',
                container: 'h-4',
                base: 'size-4 data-[state=checked]:ring-blue-500',
                indicator: 'bg-blue-500 after:bg-white',
              }"
            >
              <template #label="{ item }">
                <span aria-hidden="true" class="absolute top-1/2 left-4 flex size-10 -translate-y-1/2 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                  <UIcon :name="item.icon" class="size-6" />
                </span>
                {{ item.label }}
              </template>
            </URadioGroup>

            <p v-if="validation || error" role="alert" class="text-sm text-red-600 dark:text-red-400">
              {{ validation || error }}
            </p>

            <UButton v-if="accountChanged" color="neutral" variant="outline" @click="reloadNuxtApp({ force: true })">
              Reload account
            </UButton>

            <p v-if="message" role="status" class="text-sm">
              {{ message }}
            </p>

            <div class="flex justify-end">
              <UButton type="submit" size="xl" :loading="appearance.saving.value" :disabled="accountChanged || appearance.status.value !== 'ready'">
                Apply Changes
              </UButton>
            </div>
          </form>
        </template>
      </div>
    </section>
  </div>
</template>
