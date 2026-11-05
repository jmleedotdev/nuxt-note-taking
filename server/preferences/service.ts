import type { Appearance } from '../../shared/schemas/preferences'
import { eq } from 'drizzle-orm'
import { appearanceSchema, defaultAppearance } from '../../shared/schemas/preferences'
import { createDatabase } from '../db/client'
import { preferences } from '../db/schema/preferences'
import { demoDatabase } from '../demo/lifecycle'

function createPreferencesService() {
  const { db: ordinaryDatabase } = createDatabase()

  return {
    async read(ownerId: string): Promise<Appearance> {
      const db = demoDatabase() ?? ordinaryDatabase
      const [row] = await db.select({ theme: preferences.theme, font: preferences.font }).from(preferences).where(eq(preferences.ownerId, ownerId))

      return row
        ? appearanceSchema.parse(row)
        : { ...defaultAppearance }
    },
    async save(ownerId: string, input: Appearance): Promise<Appearance> {
      const db = demoDatabase() ?? ordinaryDatabase
      const [row] = await db.insert(preferences).values({ ownerId, ...input }).onConflictDoUpdate({
        target: preferences.ownerId,
        set: input,
      }).returning({ theme: preferences.theme, font: preferences.font })

      return appearanceSchema.parse(row)
    },
  }
}

let instance: ReturnType<typeof createPreferencesService> | undefined

export function preferencesService() {
  return instance ??= createPreferencesService()
}
