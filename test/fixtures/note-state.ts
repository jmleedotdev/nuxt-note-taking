import { defineEventHandler, readBody } from 'h3'
import { authService } from '../../server/auth/service'

// Controlled clock/archive fixtures only; assertions use the application HTTP seam.
// This handler is mounted by this test suite, never by runtime configuration.
export default defineEventHandler(async (event) => {
  const { id, lastEdited, isArchived } = await readBody(event)
  const { client } = authService()

  await client`UPDATE notes SET last_edited = ${lastEdited}, is_archived = ${isArchived} WHERE id = ${id}`

  return { status: 'configured' }
})
