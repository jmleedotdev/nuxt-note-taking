import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  isArchived: boolean('is_archived').notNull().default(false),
  lastEdited: timestamp('last_edited', { withTimezone: true }).notNull().defaultNow(),
  version: integer('version').notNull().default(1),
}, table => [
  index('notes_owner_order_idx').on(table.ownerId, table.isArchived, table.lastEdited, table.id),
  check('notes_positive_version', sql`${table.version} > 0`),
  check('notes_title_length', sql`char_length(btrim(${table.title})) BETWEEN 1 AND 200`),
  check('notes_content_length', sql`char_length(${table.content}) <= 100000`),
  check('notes_tag_count', sql`cardinality(${table.tags}) <= 20`),
])
