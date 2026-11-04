import { noteInputSchema } from '../../../shared/schemas/note'
import { checkAuthOrigin } from '../../auth/http'
import { notesHTTP } from '../../notes/http'
import { notesService } from '../../notes/service'
import { readApplicationJSON } from '../../utils/readApplicationJSON'

export default defineEventHandler(event => notesHTTP(event, async (ownerId) => {
  if (!checkAuthOrigin(event)) {
    setResponseStatus(event, 403)

    return {
      error: { code: 'FORBIDDEN_ORIGIN' },
    }
  }

  // 100,000 UTF-16 units can require 600KB when JSON-escaped.
  const body = await readApplicationJSON(event, 650000)

  if ('error' in body)
    return body

  const parsed = noteInputSchema.safeParse(body.data)

  if (!parsed.success) {
    setResponseStatus(event, 422)

    return {
      error: {
        code: 'VALIDATION',
        fields: Object.fromEntries(parsed.error.issues.map(issue => [issue.path[0] ?? 'note', issue.message])),
      },
    }
  }

  const note = await notesService().create(ownerId, parsed.data)

  setResponseStatus(event, 201)

  return note
}))
