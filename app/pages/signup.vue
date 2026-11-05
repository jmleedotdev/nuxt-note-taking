<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { registrationSchema } from '#shared/schemas/registration'

useHead({ title: 'Sign Up' })

const state = reactive({ email: '', password: '' })
const showPassword = ref(false)
const pending = ref(false)
const message = ref('')
const form = useTemplateRef('form')
const registration = useRegistration()

async function submit(event: FormSubmitEvent<z.output<typeof registrationSchema>>) {
  pending.value = true
  message.value = ''

  const result = await registration.submit('/api/registration', event.data)

  pending.value = false

  if (result.ok) {
    state.password = ''
    await navigateTo('/check-email')
  } else {
    message.value = result.message

    if (result.fields) {
      form.value?.setErrors(Object.entries(result.fields).map(([name, message]) => ({ name, message })))
    }
  }
}
</script>

<template>
  <AccountPanel>
    <h1 class="text-center text-2xl font-bold tracking-tight">
      Create Your Account
    </h1>

    <p class="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-300">
      Sign up to start organizing your notes and boost your productivity.
    </p>

    <UForm ref="form" :schema="registrationSchema" :state="state" :validate-on="[]" class="mt-8 space-y-4" @submit="submit">
      <UFormField name="email" label="Email Address">
        <UInput v-model="state.email" type="email" autocomplete="email" placeholder="you@example.test" class="w-full" :disabled="pending" />
      </UFormField>

      <UFormField name="password" label="Password" help="At least 8 characters">
        <UInput v-model="state.password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" class="w-full" :disabled="pending">
          <template #trailing>
            <UButton type="button" color="neutral" variant="link" :icon="showPassword ? 'i-app-hide-password' : 'i-app-show-password'" :aria-label="showPassword ? 'Hide password' : 'Show password'" :aria-pressed="showPassword" :disabled="pending" @click="showPassword = !showPassword" />
          </template>
        </UInput>

        <template #help="{ help }">
          <span class="flex items-center gap-2">
            <UIcon name="i-app-info" class="size-4 shrink-0" aria-hidden="true" />

            <span>{{ help }}</span>
          </span>
        </template>
      </UFormField>

      <p v-if="message" role="alert" class="text-sm text-red-600 dark:text-red-400">
        {{ message }} <NuxtLink to="/check-email" class="underline">Request another email</NuxtLink>
      </p>

      <UButton type="submit" block size="xl" :loading="pending">
        Sign up
      </UButton>
    </UForm>

    <p class="mt-6 border-t border-neutral-200 pt-6 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
      Already have an account? <NuxtLink to="/login" class="font-medium text-neutral-950 underline dark:text-neutral-0">Login</NuxtLink>
    </p>
  </AccountPanel>
</template>
