import { z } from 'zod'
import { emailSchema, passwordSchema } from './registration'

export const forgotPasswordSchema = z.object({ email: emailSchema })

export const resetTokenSchema = z.string().regex(/^[a-f0-9]{64}$/, 'This reset link is invalid.')

export const resetPasswordSchema = z.object({
  token: resetTokenSchema,
  newPassword: passwordSchema,
  confirmation: z.string(),
}).refine(value => value.newPassword === value.confirmation, {
  path: ['confirmation'],
  message: 'Passwords must match.',
})
