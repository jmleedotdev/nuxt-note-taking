import { preferencesHTTP } from '../preferences/http'
import { preferencesService } from '../preferences/service'

export default defineEventHandler(event => preferencesHTTP(event, ownerId => preferencesService().read(ownerId)))
