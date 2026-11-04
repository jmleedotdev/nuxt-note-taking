import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../server/auth/password'

describe('aSCII password credential semantics', () => {
  it.each([
    [
      'minimum length',
      'a'.repeat(8),
    ],
    [
      'maximum length',
      'a'.repeat(128),
    ],
    ['letters only', 'onlylettersallowed'],
    ['digits only', '012345678901234'],
    ['symbols only', '!@#$%^&*()_+-=[]{}|;:,.<>?/~'],
    [
      'all printable non-space ASCII',
      Array.from({ length: 94 }, (_, index) => String.fromCharCode(index + 33)).join(''),
    ],
  ])('round-trips %s without composition requirements', async (_name, password) => {
    const hash = await hashPassword(password)

    expect(await verifyPassword({ password, hash })).toBe(true)
  })

  it.each([
    [
      'below minimum',
      'a'.repeat(7),
    ],
    [
      'above maximum',
      'a'.repeat(129),
    ],
    ['leading space', ' abcdefghijklmno'],
    ['trailing space', 'abcdefghijklmno '],
    ['interior space', 'abcdefg hijklmno'],
    ['tab', 'abcdefghijklmno\t'],
    ['line feed', 'abcdefghijklmno\n'],
    ['carriage return', 'abcdefghijklmno\r'],
    ['null', 'abcdefghijklmno\u0000'],
    ['delete control character', 'abcdefghijklmno\u007F'],
    ['non-breaking space', 'abcdefghijklmno\u00A0'],
    ['accented letter', 'abcdefghijklmnoé'],
    ['combining accent', 'abcdefghijklmno\u0301'],
    ['full-width letter', 'abcdefghijklmnoＡ'],
    ['emoji', 'abcdefghijklmno😀'],
    ['unpaired surrogate', 'abcdefghijklmno\uD800'],
  ])('rejects %s rather than trimming or converting it', async (_name, password) => {
    await expect(hashPassword(password)).rejects.toThrow()

    const hash = await hashPassword('abcdefghijklmno')

    expect(await verifyPassword({ password, hash })).toBe(false)
  })

  it.each([
    ['case', 'Abcdefghijklmno!', 'abcdefghijklmno!'],
    ['symbol', 'Abcdefghijklmno!', 'Abcdefghijklmno?'],
  ])('treats a changed %s as a different credential', async (_name, original, changed) => {
    const hash = await hashPassword(original)

    expect(await verifyPassword({ password: original, hash })).toBe(true)
    expect(await verifyPassword({ password: changed, hash })).toBe(false)
  })
})
