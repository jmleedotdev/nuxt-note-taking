import { sql } from 'drizzle-orm'
import { check, pgTable, text } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const preferences = pgTable('appearance_preferences', {
  ownerId: text('owner_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('system'),
  font: text('font').notNull().default('inter'),
}, table => [
  check('appearance_theme', sql`${table.theme} IN ('light', 'dark', 'system')`),
  check('appearance_font', sql`${table.font} IN ('inter', 'noto-serif', 'source-code-pro')`),
])
