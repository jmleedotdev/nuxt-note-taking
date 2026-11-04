import { z } from 'zod'
import { notesHTTP } from '../../notes/http'
import { notesService } from '../../notes/service'

export default defineEventHandler(event => notesHTTP(event, async (ownerId) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  const note = id.success
    ? await notesService().read(ownerId, id.data)
    : null

  if (!note) {
    setResponseStatus(event, 404)

    return {
      error: { code: 'NOTE_NOT_FOUND' },
    }
  }

  return note
}))
