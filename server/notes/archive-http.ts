import type { H3Event } from 'h3'
import { z } from 'zod'
import { noteVersionSchema } from '../../shared/schemas/note'
import { notesHTTP, readNoteInput } from './http'
import { notesService } from './service'

export function archiveHTTP(event: H3Event, archived: boolean) {
  return notesHTTP(event, async (ownerId) => {
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

    const result = await notesService().setArchived(ownerId, id.data, parsed.data.version, archived)

    if (result.error) {
      setResponseStatus(event, result.error === 'NOTE_NOT_FOUND'
        ? 404
        : 409)

      return {
        error: { code: result.error },
      }
    }

    return result.note
  })
}
