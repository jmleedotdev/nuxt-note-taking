interface RegistrationResult {
  status: 'check-email'
  resendAfter: number
}

interface RegistrationFailure {
  error?: {
    code: string
    fields?: Record<string, string>
  }
  retryAfter?: number
}

export function useRegistration() {
  const email = useState('registration-email', () => '')
  const cooldownUntil = useState('registration-cooldown', () => 0)

  async function submit(path: '/api/registration' | '/api/registration/resend', body: { email: string, password?: string }) {
    try {
      const response = await $fetch<RegistrationResult>(path, { method: 'POST', body })

      email.value = body.email
      cooldownUntil.value = Date.now() + response.resendAfter * 1000

      return { ok: true as const }
    } catch (error) {
      const failure = (error as { data?: RegistrationFailure }).data

      if (failure?.retryAfter) {
        cooldownUntil.value = Date.now() + failure.retryAfter * 1000
      }

      return {
        ok: false as const,
        fields: failure?.error?.fields,
        message: failure?.error?.code === 'RATE_LIMITED'
          ? 'Too many attempts. Please wait before trying again.'
          : 'We could not complete this request. Please try again. If you already signed up, request another email.',
      }
    }
  }

  return { email, cooldownUntil, submit }
}
