import { z } from 'zod'

export const appearanceSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  font: z.enum(['inter', 'noto-serif', 'source-code-pro']),
}).strict()

export type Appearance = z.infer<typeof appearanceSchema>

export const defaultAppearance: Appearance = { theme: 'system', font: 'inter' }
