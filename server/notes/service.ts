import type { NoteInput } from '../../shared/schemas/note'
import type { Note } from '../../shared/types/note'
import { and, desc, eq } from 'drizzle-orm'
import { createDatabase } from '../db/client'
import { notes } from '../db/schema/notes'

function toNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags,
    lastEdited: row.lastEdited.toISOString(),
    isArchived: row.isArchived,
    version: row.version,
  }
}

function createNotesService() {
  const { db } = createDatabase()

  return {
    async create(ownerId: string, input: NoteInput) {
      const [row] = await db.insert(notes).values({ ...input, ownerId }).returning()

      return toNote(row!)
    },
    async list(ownerId: string) {
      const rows = await db.select().from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.isArchived, false))).orderBy(desc(notes.lastEdited), desc(notes.id))

      return rows.map(toNote)
    },
    async read(ownerId: string, id: string) {
      const [row] = await db.select().from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id)))

      return row
        ? toNote(row)
        : null
    },
  }
}

let instance: ReturnType<typeof createNotesService> | undefined

export function notesService() {
  return instance ??= createNotesService()
}
