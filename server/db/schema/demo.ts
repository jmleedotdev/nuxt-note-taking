import { pgTable, text } from 'drizzle-orm/pg-core'

// ISO UTC dates compare lexically and avoid driver-specific date conversion.
export const demoLifecycle = pgTable('demo_lifecycle', {
  id: text('id').primaryKey(),
  completedDay: text('completed_day').notNull(),
})
