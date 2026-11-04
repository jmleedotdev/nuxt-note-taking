import { z } from 'zod'
import { noteUpdateSchema } from '../../../shared/schemas/note'
import { notesHTTP, readNoteInput } from '../../notes/http'
import { notesService } from '../../notes/service'

export default defineEventHandler(event => notesHTTP(event, async (ownerId) => {
  const parsed = await readNoteInput(event, noteUpdateSchema)

  if ('error' in parsed)
    return parsed

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
