import { noteInputSchema } from '../../../shared/schemas/note'
import { notesHTTP, readNoteInput } from '../../notes/http'
import { notesService } from '../../notes/service'

export default defineEventHandler(event => notesHTTP(event, async (ownerId) => {
  const parsed = await readNoteInput(event, noteInputSchema)

  if ('error' in parsed)
    return parsed

  const note = await notesService().create(ownerId, parsed.data)

  setResponseStatus(event, 201)

  return note
}))
