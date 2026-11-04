import { z } from 'zod'

const tagsSchema = z.array(z.string().trim().max(50, 'Use at most 50 characters per tag.'))
  .transform((tags) => {
    const seen = new Set<string>()

    return tags.filter((tag) => {
      const key = tag.toLowerCase()

      if (!tag || seen.has(key))
        return false
      seen.add(key)

      return true
    })
  })
  .pipe(z.array(z.string()).max(20, 'Use at most 20 tags.'))

export const noteInputSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(200, 'Use at most 200 characters for the title.'),
  content: z.string().transform(value => value.replace(/\r\n?/g, '\n')).pipe(z.string().max(100000, 'Use at most 100,000 characters for the note.')).default(''),
  tags: tagsSchema.default([]),
}).strict()

export const noteVersionSchema = z.object({
  version: z.number().int().positive(),
}).strict()

export const noteUpdateSchema = noteInputSchema.extend({
  version: z.number().int().positive(),
})

export const noteFormSchema = noteInputSchema.extend({
  tags: z.string().transform(value => value.split(',')).pipe(tagsSchema),
})

export type NoteInput = z.output<typeof noteInputSchema>
