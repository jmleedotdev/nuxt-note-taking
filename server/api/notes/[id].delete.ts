import { z } from 'zod'
import { noteVersionSchema } from '../../../shared/schemas/note'
import { notesHTTP, readNoteInput } from '../../notes/http'
import { notesService } from '../../notes/service'

export default defineEventHandler(event => notesHTTP(event, async (ownerId) => {
  const parsed = await readNoteInput(event, noteVersionSchema)

  if ('error' in parsed)
    return parsed

  const id = z.uuid().safeParse(getRouterParam(event, 'id'))

  if (!id.success) {
    setResponseStatus(event, 404)

    return {
      error: { code: 'NOTE_NOT_FOUND' },
    }
  }

  const result = await notesService().delete(ownerId, id.data, parsed.data.version)

  if (result.error) {
    setResponseStatus(event, result.error === 'NOTE_NOT_FOUND'
      ? 404
      : 409)

    return {
      error: { code: result.error },
    }
  }

  setResponseStatus(event, 204)

  return null
}))
