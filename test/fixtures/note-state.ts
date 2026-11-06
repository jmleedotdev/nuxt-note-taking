import { defineEventHandler, readBody } from 'h3'
import { authService } from '../../server/auth/service'

// Controlled clock/archive/removal fixtures only; assertions use the application HTTP seam.
// This handler is mounted by this test suite, never by runtime configuration.
export default defineEventHandler(async (event) => {
  const { id, lastEdited, isArchived, remove, clock } = await readBody(event)
  const { client } = authService()

  if (clock) {
    const [row] = await client`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) AS now`

    return {
      now: Number(row!.now),
    }
  }

  if (remove)
    await client`DELETE FROM notes WHERE id = ${id}`
  else
    await client`UPDATE notes SET last_edited = ${lastEdited}, is_archived = ${isArchived} WHERE id = ${id}`

  return { status: 'configured' }
})
