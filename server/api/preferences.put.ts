import { preferencesHTTP, readAppearanceInput } from '../preferences/http'
import { preferencesService } from '../preferences/service'

export default defineEventHandler(event => preferencesHTTP(event, async (ownerId) => {
  const input = await readAppearanceInput(event)

  if ('error' in input)
    return input

  return preferencesService().save(ownerId, input.data)
}))
