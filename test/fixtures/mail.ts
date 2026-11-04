import { defineEventHandler, readBody } from 'h3'
import { MemoryMailSender } from '../../server/auth/mail'
import { authService } from '../../server/auth/service'

export default defineEventHandler(async (event) => {
  const sender = authService().sender

  if (!(sender instanceof MemoryMailSender)) {
    throw new TypeError('Memory sender required')
  }

  if (event.method === 'POST') {
    const body = await readBody(event)

    sender.fail = body.fail === true
    sender.delay = body.delay ?? 0
  }

  return sender.messages
})
