import { defineEventHandler, readBody } from 'h3'
import { authService } from '../../server/auth/service'

// Controlled clock/archive/removal fixtures only; assertions use the application HTTP seam.
// This handler is mounted by this test suite, never by runtime configuration.
export default defineEventHandler(async (event) => {
  const { id, lastEdited, isArchived, remove } = await readBody(event)
  const { client } = authService()

  if (remove)
    await client`DELETE FROM notes WHERE id = ${id}`
  else
    await client`UPDATE notes SET last_edited = ${lastEdited}, is_archived = ${isArchived} WHERE id = ${id}`

  return { status: 'configured' }
})
