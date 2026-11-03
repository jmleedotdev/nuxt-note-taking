<script setup lang="ts">
definePageMeta({
  middleware(to) {
    const { email } = useRegistration()

    if (!email.value && !to.query.invalid) {
      return navigateTo('/login', { replace: true })
    }
  },
})

useHead({
  title: 'Check your email',
  meta: [
    { name: 'referrer', content: 'no-referrer' },
  ],
})

const registration = useRegistration()
const email = registration.email
const pending = ref(false)
const message = ref('')
const now = ref(0)
const remaining = computed(() => now.value
  ? Math.max(0, Math.ceil((registration.cooldownUntil.value - now.value) / 1000))
  : 0)

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  if (!email.value) {
    return
  }

  now.value = Date.now()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
})

async function resend() {
  if (!email.value || pending.value || remaining.value > 0) {
    return
  }

  pending.value = true

  const result = await registration.submit('/api/registration/resend', { email: email.value })

  pending.value = false
  message.value = result.ok ? '' : result.message
}
</script>

<template>
  <AccountPanel>
    <h1 class="text-center text-2xl font-bold tracking-tight">
      Check your email
    </h1>

    <p v-if="email" class="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-300">
      Open the verification link in your email before accessing your notes. The link expires in one hour.
    </p>

    <p v-if="$route.query.invalid" role="alert" class="mt-4 text-sm text-red-600 dark:text-red-400">
      This link is invalid or has expired.
    </p>

    <div v-if="email" class="mt-8 space-y-4">
      <p class="break-all text-center text-sm font-medium">
        {{ email }}
      </p>

      <p class="text-sm text-neutral-600 dark:text-neutral-300">
        Haven’t received it? Check your spam folder, then request another message. Email submission does not guarantee delivery.
      </p>

      <UButton type="button" block size="xl" :loading="pending" :disabled="pending || remaining > 0" class="justify-center bg-blue-500 text-neutral-0 hover:bg-blue-700" @click="resend">
        {{ remaining > 0 ? `Send again (${remaining}s)` : 'Send again' }}
      </UButton>

      <p v-if="message" role="status" class="text-sm">
        {{ message }}
      </p>
    </div>

    <NuxtLink :to="email ? '/signup' : '/login'" class="mt-6 block text-center text-sm underline">
      {{ email ? 'Back to sign up' : 'Back to login' }}
    </NuxtLink>
  </AccountPanel>
</template>
