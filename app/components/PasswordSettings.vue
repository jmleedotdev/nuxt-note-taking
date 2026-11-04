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
  { name: 'currentPassword', label: 'Old Password', autocomplete: 'current-password' },
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
        ? 'Old password is incorrect. Please try again.'
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
  <div class="w-full xl:max-w-132">
    <h2 class="text-2xl leading-[1.2] font-bold tracking-tight xl:text-base xl:font-semibold">
      Change Password
    </h2>

    <UForm :schema="changePasswordSchema" :state="state" :validate-on="[]" class="mt-5 space-y-6 sm:mt-6" @submit="submit">
      <UFormField v-for="field in fields" :key="field.name" :name="field.name" :label="field.label" :help="field.name === 'newPassword' ? 'At least 8 characters' : undefined" :ui="{ label: 'font-medium leading-[1.2] text-neutral-950 dark:text-neutral-0', container: 'mt-1.5', help: 'mt-2 flex items-center gap-2 text-xs leading-[1.2] text-neutral-600 dark:text-neutral-400' }">
        <template v-if="field.name === 'newPassword'" #help="{ help }">
          <UIcon name="i-app-info" class="size-3.5 shrink-0" aria-hidden="true" />
          {{ help }}
        </template>

        <UInput v-model="state[field.name]" :type="showPassword[field.name] ? 'text' : 'password'" :autocomplete="field.autocomplete" class="w-full" size="xl" :ui="{ base: 'h-11 rounded-lg bg-transparent text-neutral-950 ring-neutral-300 dark:bg-transparent dark:text-neutral-0 dark:ring-neutral-600' }" :disabled="pending">
          <template #trailing>
            <UButton type="button" color="neutral" variant="link" class="text-neutral-500 dark:text-neutral-400" :icon="showPassword[field.name] ? 'i-app-hide-password' : 'i-app-show-password'" :aria-label="`${showPassword[field.name] ? 'Hide' : 'Show'} ${field.label.toLowerCase()}`" :aria-pressed="showPassword[field.name]" :disabled="pending" @click="showPassword[field.name] = !showPassword[field.name]" />
          </template>
        </UInput>
      </UFormField>

      <p v-if="message" role="alert" class="text-sm text-red-600 dark:text-red-400">
        {{ message }}
      </p>

      <p class="text-xs text-neutral-600 dark:text-neutral-400">
        After saving, you’ll need to log in again on every device, including this one.
      </p>

      <div class="flex justify-end">
        <UButton type="submit" :loading="pending" class="min-h-10.5 bg-blue-500 px-4 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-700">
          Save Password
        </UButton>
      </div>
    </UForm>
  </div>
</template>
