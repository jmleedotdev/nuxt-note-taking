import { z } from 'zod'
import { passwordSchema } from './registration'

export const changePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
  confirmation: z.string(),
}).refine(value => value.newPassword === value.confirmation, {
  path: ['confirmation'],
  message: 'Passwords must match.',
})
