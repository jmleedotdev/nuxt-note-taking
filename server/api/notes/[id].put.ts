import { z } from 'zod'
import { noteUpdateSchema } from '../../../shared/schemas/note'
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

  const parsed = noteUpdateSchema.safeParse(body.data)

  if (!parsed.success) {
    setResponseStatus(event, 422)

    return {
      error: {
        code: 'VALIDATION',
        fields: Object.fromEntries(parsed.error.issues.map(issue => [issue.path[0] ?? 'note', issue.message])),
      },
    }
  }

  const id = z.uuid().safeParse(getRouterParam(event, 'id'))

  if (!id.success) {
    setResponseStatus(event, 404)

    return {
      error: { code: 'NOTE_NOT_FOUND' },
    }
  }

  const { version, ...input } = parsed.data
  const result = await notesService().update(ownerId, id.data, version, input)

  if (result.error) {
    setResponseStatus(event, result.error === 'NOTE_NOT_FOUND'
      ? 404
      : 409)

    return {
      error: { code: result.error },
    }
  }

  return result.note
}))
