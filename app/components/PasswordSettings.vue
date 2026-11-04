<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { changePasswordSchema } from '#shared/schemas/password-change'

const passwordChange = usePasswordChange()
const state = reactive({ currentPassword: '', newPassword: '', confirmation: '' })
const pending = ref(false)
const message = ref('')
const showPassword = reactive({ currentPassword: false, newPassword: false, confirmation: false })
const fields = [
  { name: 'currentPassword', label: 'Current Password', autocomplete: 'current-password' },
  { name: 'newPassword', label: 'New Password', autocomplete: 'new-password' },
  { name: 'confirmation', label: 'Confirm New Password', autocomplete: 'new-password' },
] as const

async function submit(event: FormSubmitEvent<z.output<typeof changePasswordSchema>>) {
  if (pending.value)
    return

  pending.value = true
  message.value = ''

  try {
    const status = await passwordChange.change(event.data.currentPassword, event.data.newPassword, event.data.confirmation)

    if (status === 200) {
      Object.assign(state, { currentPassword: '', newPassword: '', confirmation: '' })
      await navigateTo('/login?changed=1', { replace: true })
    } else if (status === 401 || status === 403) {
      await navigateTo(status === 401
        ? '/login'
        : '/check-email?required=1', { replace: true })
    } else {
      message.value = status === 400
        ? 'Current password is incorrect. Please try again.'
        : status === 429
          ? 'Too many attempts. Please wait before trying again.'
          : status === 422
            ? 'Check your passwords and make sure the new passwords match.'
            : 'We could not change your password. Please try again.'
    }
  } catch {
    message.value = 'We could not change your password. Please try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="max-w-110">
    <h2 class="text-2xl font-bold tracking-tight xl:text-base xl:font-semibold">
      Change Password
    </h2>

    <p class="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
      After saving, you’ll need to log in again on every device, including this one.
    </p>

    <UForm :schema="changePasswordSchema" :state="state" :validate-on="[]" class="mt-6 space-y-6" @submit="submit">
      <UFormField v-for="field in fields" :key="field.name" :name="field.name" :label="field.label" :hint="field.name === 'newPassword' ? '8–128 characters. No spaces.' : undefined">
        <UInput v-model="state[field.name]" :type="showPassword[field.name] ? 'text' : 'password'" :autocomplete="field.autocomplete" class="w-full" size="xl" :disabled="pending">
          <template #trailing>
            <UButton type="button" color="neutral" variant="link" class="text-neutral-500 dark:text-neutral-400" :icon="showPassword[field.name] ? 'i-app-hide-password' : 'i-app-show-password'" :aria-label="`${showPassword[field.name] ? 'Hide' : 'Show'} ${field.label.toLowerCase()}`" :aria-pressed="showPassword[field.name]" :disabled="pending" @click="showPassword[field.name] = !showPassword[field.name]" />
          </template>
        </UInput>
      </UFormField>

      <p v-if="message" role="alert" class="text-sm text-red-600 dark:text-red-400">
        {{ message }}
      </p>

      <div class="flex justify-end">
        <UButton type="submit" :loading="pending" class="min-h-10.5 bg-blue-500 px-4 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-700">
          Save Password
        </UButton>
      </div>
    </UForm>
  </div>
</template>
