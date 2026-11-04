import { z } from 'zod'

// Printable ASCII from ! through ~; spaces and all other characters are excluded.
export const passwordSchema = z.string().regex(
  /^[\x21-\x7E]{8,128}$/,
  'Use 8–128 characters: English letters, numbers, and symbols only. No spaces.',
)

export const emailSchema = z.email('Enter a valid email address.').max(254).transform(value => value.toLowerCase())

export const registrationSchema = z.object({ email: emailSchema, password: passwordSchema })

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().refine(value => passwordSchema.safeParse(value).success, 'Enter a password.'),
})

export const resendSchema = z.object({ email: emailSchema })
