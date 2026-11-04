import { Buffer } from 'node:buffer'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { passwordSchema } from '../../shared/schemas/registration'

const scrypt = promisify(scryptCallback)

export async function hashPassword(password: string) {
  passwordSchema.parse(password)

  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(Buffer.from(password, 'utf8'), salt, 64) as Buffer

  return `scrypt-raw-v1:${salt}:${key.toString('hex')}`
}

export async function verifyPassword({ password, hash }: { password: string, hash: string }) {
  const [format, salt, encoded] = hash.split(':')

  if (format !== 'scrypt-raw-v1' || !salt || !encoded || !passwordSchema.safeParse(password).success) {
    return false
  }

  const actual = await scrypt(Buffer.from(password, 'utf8'), salt, 64) as Buffer
  const expected = Buffer.from(encoded, 'hex')

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
