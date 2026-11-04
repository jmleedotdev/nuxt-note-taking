import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const passwordReset = pgTable('password_reset', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
