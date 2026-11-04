import { notesHTTP } from '../../notes/http'
import { notesService } from '../../notes/service'

export default defineEventHandler(event => notesHTTP(event, async ownerId => ({
  tags: await notesService().tags(ownerId),
})))
