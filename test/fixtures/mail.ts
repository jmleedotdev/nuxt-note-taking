import { defineEventHandler, readBody } from 'h3'
import { MemoryMailSender } from '../../server/registration/mail'
import { registrationService } from '../../server/registration/service'

export default defineEventHandler(async (event) => {
  const sender = registrationService().sender

  if (!(sender instanceof MemoryMailSender)) {
    throw new TypeError('Memory sender required')
  }

  if (event.method === 'POST') {
    sender.fail = (await readBody(event)).fail === true
  }

  return sender.messages
})
