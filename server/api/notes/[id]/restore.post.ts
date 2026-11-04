import { archiveHTTP } from '../../../notes/archive-http'

export default defineEventHandler(event => archiveHTTP(event, false))
