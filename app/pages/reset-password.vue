<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { resetPasswordSchema, resetTokenSchema } from '#shared/schemas/password-recovery'

useHead({
  title: 'Reset password',
  meta: [
    { name: 'referrer', content: 'no-referrer' },
  ],
})

if (import.meta.server)
  useResponseHeader('Cache-Control').value = 'no-store'

const route = useRoute()
const recovery = usePasswordRecovery()
const token = typeof route.query.token === 'string'
  ? route.query.token
  : ''
const state = reactive({ token, newPassword: '', confirmation: '' })
const invalid = ref(!resetTokenSchema.safeParse(token).success)
const pending = ref(false)
const message = ref('')
const showPassword = reactive({ newPassword: false, confirmation: false })
const fields = [
  { name: 'newPassword', label: 'New Password' },
  { name: 'confirmation', label: 'Confirm Password' },
] as const

async function submit(event: FormSubmitEvent<z.output<typeof resetPasswordSchema>>) {
  if (pending.value)
    return

  pending.value = true
  message.value = ''

  try {
    const status = await recovery.reset(event.data.token, event.data.newPassword, event.data.confirmation)

    if (status === 200) {
      state.newPassword = ''
      state.confirmation = ''
      await navigateTo('/login?reset=1', { replace: true })
    } else if (status === 400) {
      invalid.value = true
      state.newPassword = ''
      state.confirmation = ''
    } else {
      message.value = status === 429
        ? 'Too many attempts. Please wait before trying again.'
        : 'We could not reset your password. Please try again.'
    }
  } catch {
    message.value = 'We could not reset your password. Please try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AccountPanel>
    <h1 class="text-center text-2xl font-bold tracking-tight">
      Reset your password
    </h1>

    <template v-if="invalid">
      <p role="alert" class="mt-6 text-sm text-red-600 dark:text-red-400">
        This link is invalid, expired, already used, or replaced by a newer link. Request a new link to reset your password.
      </p>

      <NuxtLink to="/forgot-password" class="mt-6 block text-center text-sm underline">
        Request a new link
      </NuxtLink>
    </template>

    <template v-else>
      <p class="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-300">
        Choose a new password to secure your account. You’ll need to log in again on every device.
      </p>

      <UForm :schema="resetPasswordSchema" :state="state" :validate-on="[]" class="mt-8 space-y-4" @submit="submit">
        <UFormField v-for="field in fields" :key="field.name" :name="field.name" :label="field.label">
          <UInput v-model="state[field.name]" :type="showPassword[field.name] ? 'text' : 'password'" autocomplete="new-password" class="w-full" :disabled="pending">
            <template #trailing>
              <UButton type="button" color="neutral" variant="link" :icon="showPassword[field.name] ? 'i-app-hide-password' : 'i-app-show-password'" :aria-label="`${showPassword[field.name] ? 'Hide' : 'Show'} ${field.label.toLowerCase()}`" :aria-pressed="showPassword[field.name]" :disabled="pending" @click="showPassword[field.name] = !showPassword[field.name]" />
            </template>
          </UInput>
        </UFormField>

        <p v-if="message" role="alert" class="text-sm text-red-600 dark:text-red-400">
          {{ message }}
        </p>

        <UButton type="submit" block size="xl" :loading="pending">
          Reset password
        </UButton>
      </UForm>

      <NuxtLink to="/forgot-password" class="mt-6 block text-center text-sm underline">
        Request a new link
      </NuxtLink>
    </template>

    <NuxtLink to="/login" class="mt-4 block text-center text-sm underline">
      Back to login
    </NuxtLink>
  </AccountPanel>
</template>
