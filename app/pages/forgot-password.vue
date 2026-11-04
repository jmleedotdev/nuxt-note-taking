<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { forgotPasswordSchema } from '#shared/schemas/password-recovery'

useHead({
  title: 'Forgot password',
  meta: [
    { name: 'referrer', content: 'no-referrer' },
  ],
})

if (import.meta.server)
  useResponseHeader('Cache-Control').value = 'no-store'

const recovery = usePasswordRecovery()
const state = reactive({ email: '' })
const sent = ref(false)
const pending = ref(false)
const message = ref('')
const remaining = ref(0)

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    remaining.value = Math.max(0, remaining.value - 1)
  }, 1000)
})
onUnmounted(() => clearInterval(timer))

async function request(email: string) {
  if (pending.value || remaining.value)
    return

  pending.value = true
  message.value = ''

  try {
    const response = await recovery.request(email)

    if (response.status === 202) {
      state.email = email
      sent.value = true
      remaining.value = response._data?.resendAfter ?? 30
    } else if (response.status === 429) {
      remaining.value = response._data?.retryAfter ?? 30
      message.value = 'Too many attempts. Please wait before trying again.'
    } else {
      message.value = 'We could not request a reset link. Please try again.'
    }
  } catch {
    message.value = 'We could not request a reset link. Please try again.'
  } finally {
    pending.value = false
  }
}

function submit(event: FormSubmitEvent<z.output<typeof forgotPasswordSchema>>) {
  return request(event.data.email)
}
</script>

<template>
  <AccountPanel>
    <h1 class="text-center text-2xl font-bold tracking-tight">
      {{ sent ? 'Check your email' : 'Forgot your password?' }}
    </h1>

    <p v-if="!sent" class="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-300">
      No worries! We’ll send you a link to reset your password.
    </p>

    <div v-if="sent" class="mt-8 space-y-4">
      <p role="status" class="text-center text-sm">
        If an account exists for this email, we’ll send a reset link. Only the newest link works, once, for thirty minutes.
      </p>

      <p class="break-all text-center text-sm font-medium">
        {{ state.email }}
      </p>

      <p class="text-sm text-neutral-600 dark:text-neutral-300">
        Haven’t received it? Check your spam folder, then request another link. Email submission does not guarantee delivery.
      </p>

      <UButton type="button" block size="xl" :loading="pending" :disabled="pending || remaining > 0" class="justify-center bg-blue-500 text-neutral-0 hover:bg-blue-700" @click="request(state.email)">
        {{ remaining > 0 ? `Send again (${remaining}s)` : 'Send again' }}
      </UButton>

      <UButton type="button" color="neutral" variant="link" block :disabled="pending" @click="sent = false">
        Use another email address
      </UButton>
    </div>

    <UForm v-else :schema="forgotPasswordSchema" :state="state" :validate-on="[]" class="mt-8 space-y-4" @submit="submit">
      <UFormField name="email" label="Email Address">
        <UInput v-model="state.email" type="email" autocomplete="email" placeholder="email@example.com" class="w-full" size="xl" :disabled="pending" />
      </UFormField>

      <UButton type="submit" block size="xl" :loading="pending" :disabled="pending || remaining > 0" class="justify-center bg-blue-500 font-semibold text-neutral-0 hover:bg-blue-700">
        {{ remaining > 0 ? `Try again (${remaining}s)` : 'Send reset link' }}
      </UButton>
    </UForm>

    <p v-if="message" role="alert" class="mt-4 text-sm text-red-600 dark:text-red-400">
      {{ message }}
    </p>

    <NuxtLink to="/login" class="mt-6 block text-center text-sm underline">
      Back to login
    </NuxtLink>
  </AccountPanel>
</template>
