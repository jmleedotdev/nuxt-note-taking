import { z } from 'zod'
import { notesHTTP } from '../../notes/http'
import { notesService } from '../../notes/service'

const filters = z.object({
  archived: z.enum(['true', 'false']).default('false'),
  q: z.string().max(100000).default(''),
  tag: z.string().max(50).default(''),
})

export default defineEventHandler(event => notesHTTP(event, async (ownerId) => {
  const parsed = filters.safeParse(getQuery(event))

  if (!parsed.success) {
    setResponseStatus(event, 422)

    return {
      error: { code: 'VALIDATION' },
    }
  }

  const { archived, q, tag } = parsed.data

  return { notes: await notesService().list(ownerId, archived === 'true', q, tag) }
}))
