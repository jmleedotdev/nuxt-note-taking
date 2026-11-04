import type { NoteInput } from '../../shared/schemas/note'
import type { Note } from '../../shared/types/note'
import { and, desc, eq, ne, or, sql } from 'drizzle-orm'
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
    async update(ownerId: string, id: string, version: number, input: NoteInput) {
      const changed = or(ne(notes.title, input.title), ne(notes.content, input.content), ne(notes.tags, input.tags))!
      // PostgreSQL rechecks this predicate after waiting for competing writes.
      // CASE preserves the logical clock/version for normalized no-op saves.
      const [row] = await db.update(notes).set({
        ...input,
        version: sql`CASE WHEN ${changed} THEN ${notes.version} + 1 ELSE ${notes.version} END`,
        lastEdited: sql`CASE WHEN ${changed} THEN clock_timestamp() ELSE ${notes.lastEdited} END`,
      }).where(and(
        eq(notes.ownerId, ownerId),
        eq(notes.id, id),
        eq(notes.version, version),
        eq(notes.isArchived, false),
      )).returning()

      if (row) {
        return {
          note: toNote(row),
        }
      }

      const [current] = await db.select().from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id)))

      return {
        error: !current
          ? 'NOTE_NOT_FOUND'
          : current.isArchived ? 'NOTE_NOT_EDITABLE' : 'NOTE_VERSION_CONFLICT',
      }
    },
    async setArchived(ownerId: string, id: string, version: number, isArchived: boolean) {
      const [row] = await db.update(notes).set({
        isArchived,
        version: sql`CASE WHEN ${notes.isArchived} <> ${isArchived} THEN ${notes.version} + 1 ELSE ${notes.version} END`,
      }).where(and(
        eq(notes.ownerId, ownerId),
        eq(notes.id, id),
        eq(notes.version, version),
      )).returning()

      if (row) {
        return {
          note: toNote(row),
        }
      }

      const [current] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id)))

      return {
        error: current ? 'NOTE_VERSION_CONFLICT' : 'NOTE_NOT_FOUND',
      }
    },
    async delete(ownerId: string, id: string, version: number) {
      const [removed] = await db.delete(notes).where(and(
        eq(notes.ownerId, ownerId),
        eq(notes.id, id),
        eq(notes.version, version),
      )).returning({ id: notes.id })

      if (removed)
        return { deleted: true } as const

      const [current] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id)))

      return {
        error: current ? 'NOTE_VERSION_CONFLICT' : 'NOTE_NOT_FOUND',
      } as const
    },
    async tags(ownerId: string) {
      const rows = await db.select({ tag: sql<string>`min(tag)` }).from(notes).crossJoin(sql`unnest(${notes.tags}) AS tag`).where(eq(notes.ownerId, ownerId)).groupBy(sql`lower(tag)`).orderBy(sql`lower(tag)`)

      return rows.map(row => row.tag)
    },
    async list(ownerId: string, archived = false, query = '', tag = '') {
      // strpos is a literal substring operation: %, _ and backslash have no wildcard meaning.
      const matches = query
        ? sql`(
        strpos(lower(${notes.title}), lower(${query})) > 0
        OR strpos(lower(${notes.content}), lower(${query})) > 0
        OR EXISTS (SELECT 1 FROM unnest(${notes.tags}) AS tag WHERE strpos(lower(tag), lower(${query})) > 0)
      )`
        : undefined
      const tagged = tag
        ? sql`EXISTS (SELECT 1 FROM unnest(${notes.tags}) AS tag WHERE lower(tag) = lower(${tag}))`
        : undefined
      const rows = await db.select().from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.isArchived, archived), matches, tagged)).orderBy(desc(notes.lastEdited), desc(notes.id))

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
