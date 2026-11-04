<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { loginSchema } from '#shared/schemas/registration'

useHead({ title: 'Login' })

const state = reactive({ email: '', password: '' })
const showPassword = ref(false)
const pending = ref(false)
const message = ref('')
const authentication = useAuthentication()
const registration = useRegistration()

async function submit(event: FormSubmitEvent<z.output<typeof loginSchema>>) {
  pending.value = true
  message.value = ''

  try {
    const status = await authentication.login(event.data.email, event.data.password)

    if (status === 200) {
      state.password = ''
      await navigateTo('/', { replace: true })
    } else if (status === 403) {
      registration.email.value = event.data.email
      state.password = ''
      await navigateTo('/check-email')
    } else {
      message.value = status === 429
        ? 'Too many attempts. Please wait before trying again.'
        : status === 401
          ? 'Email or password is incorrect.'
          : 'We could not log you in. Please try again.'
    }
  } catch {
    message.value = 'We could not log you in. Please try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AccountPanel>
    <h1 class="text-center text-2xl font-bold tracking-tight">
      Welcome to Note
    </h1>

    <p class="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-300">
      Please log in to continue
    </p>

    <p v-if="$route.query.verified === '1'" role="status" class="mt-4 text-center text-sm">
      Email verified. You can now log in.
    </p>

    <p v-if="$route.query.reset === '1'" role="status" class="mt-4 text-center text-sm">
      Password reset. Please log in with your new password.
    </p>

    <p v-if="$route.query.changed === '1'" role="status" class="mt-4 text-center text-sm">
      Password changed. Please log in with your new password.
    </p>

    <UForm :schema="loginSchema" :state="state" :validate-on="[]" class="mt-8 space-y-4" @submit="submit">
      <UFormField name="email" label="Email Address">
        <UInput v-model="state.email" type="email" autocomplete="email" placeholder="email@example.com" class="w-full" :disabled="pending" />
      </UFormField>

      <UFormField name="password" label="Password">
        <UInput v-model="state.password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" class="w-full" :disabled="pending">
          <template #trailing>
            <UButton type="button" color="neutral" variant="link" :icon="showPassword ? 'i-app-hide-password' : 'i-app-show-password'" :aria-label="showPassword ? 'Hide password' : 'Show password'" :aria-pressed="showPassword" :disabled="pending" @click="showPassword = !showPassword" />
          </template>
        </UInput>
      </UFormField>

      <p v-if="message" role="alert" class="text-sm text-red-600 dark:text-red-400">
        {{ message }}
      </p>

      <UButton type="submit" block size="xl" :loading="pending">
        Login
      </UButton>
    </UForm>

    <NuxtLink to="/forgot-password" class="mt-4 block text-right text-sm text-neutral-600 underline dark:text-neutral-300">
      Forgot password?
    </NuxtLink>

    <p class="mt-6 border-t border-neutral-200 pt-6 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
      No account yet? <NuxtLink to="/signup" class="font-medium text-neutral-950 underline dark:text-neutral-0">Sign Up</NuxtLink>
    </p>
  </AccountPanel>
</template>
