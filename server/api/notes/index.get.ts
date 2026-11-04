import { notesHTTP } from '../../notes/http'
import { notesService } from '../../notes/service'

export default defineEventHandler(event => notesHTTP(event, async ownerId => ({
  notes: await notesService().list(ownerId, getQuery(event).archived === 'true'),
})))
