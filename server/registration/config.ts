import { z } from 'zod'

const localMailOrigin = z.url({
  protocol: /^http$/,
  hostname: /^(?:localhost|127\.0\.0\.1|\[::1\])$/,
}).refine(value => URL.canParse(value) && new URL(value).origin === value, 'Use a local HTTP address without adding anything after the port')
const schema = z.object({
  APP_ENV: z.enum(['development', 'preview', 'test']),
  APP_URL: z.url().refine(value => new URL(value).origin === value, 'Use an origin without a path'),
  DATABASE_URL: z.url().refine(value => /^postgres(?:ql)?:/.test(value)),
  APP_AUTH_SECRET: z.string().min(32),
  MAIL_MODE: z.enum(['local', 'memory']),
  MAILTRAP_URL: z.preprocess(
    value => value === ''
      ? undefined
      : value,
    localMailOrigin.optional(),
  ),
  APP_TRUSTED_PROXY_IP: z.ipv4().or(z.ipv6()).optional(),
}).superRefine((value, ctx) => {
  if (value.MAIL_MODE === 'memory' && value.APP_ENV !== 'test') {
    ctx.addIssue({ code: 'custom', message: 'Memory mail is test-only' })
  }

  if (value.MAIL_MODE === 'local' && !value.MAILTRAP_URL) {
    ctx.addIssue({ code: 'custom', message: 'Mailtrap Local URL required' })
  }
})

export function registrationConfig() {
  const result = schema.safeParse(process.env)

  if (!result.success) {
    throw new Error('Invalid server registration configuration')
  }

  return result.data
}
