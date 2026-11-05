import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashPassword } from '../../server/auth/password'
import { isolatedHTTPDatabase } from '../fixtures/database'

const database = isolatedHTTPDatabase()
const password = 'PublicTest1!'
const emails = ['demo1@email.test', 'demo2@email.test']
const resetToken = 'a'.repeat(64)

let outsiderCookie = ''

let verificationToken = ''

function provision(target = database.url, extraEnv: Record<string, string> = {}, confirmation = new URL(target).pathname.slice(1)) {
  return spawnSync('pnpm', [
    'exec',
    'tsx',
    'scripts/provision-demo.ts',
    '--confirm-database',
    confirmation,
  ], {
    env: {
      ...process.env,
      DATABASE_URL: target,
      APP_ENV: 'demo',
      DEMO_PASSWORD_1: password,
      DEMO_PASSWORD_2: password,
      ...extraEnv,
    },
    encoding: 'utf8',
  })
}

function request(path: string, body?: object, cookie = '', method = body ? 'POST' : 'GET') {
  return fetch(url(path), {
    method,
    headers: { cookie, 'origin': 'http://localhost:3000', 'content-type': 'application/json' },
    ...(body
      ? {
          body: JSON.stringify(body),
        }
      : {}),
    redirect: 'manual',
  })
}

async function login(email: string) {
  const response = await request('/api/login', { email, password })

  expect(response.status).toBe(200)

  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
}

describe('demo access over real HTTP', async () => {
  beforeAll(async () => {
    await database.prepare()

    const result = provision()

    expect(result.status, result.stderr).toBe(0)

    const sql = postgres(database.url)

    try {
      const hash = await hashPassword(password)

      await sql`INSERT INTO "user" (id, name, email, email_verified) VALUES ('unrelated-demo-test', 'Other user', 'other@email.test', true)`
      await sql`INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ('unrelated-demo-test', 'unrelated-demo-test', 'credential', 'unrelated-demo-test', ${hash})`
      // Simulate authorizations issued before switching the deployment to demo.
      await sql`INSERT INTO session (id, token, user_id, expires_at) VALUES ('old-session', 'old-token', 'unrelated-demo-test', now() + interval '1 day')`

      const signature = createHmac('sha256', process.env.APP_AUTH_SECRET!).update('old-token').digest('base64')

      outsiderCookie = `better-auth.session_token=${encodeURIComponent(`old-token.${signature}`)}`
      await sql`INSERT INTO password_reset (user_id, token_hash, expires_at) VALUES ('portfolio-demo-explorer', ${createHash('sha256').update(resetToken).digest('hex')}, now() + interval '30 minutes')`

      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify({
        email: emails[0],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url')
      const input = `${header}.${payload}`

      verificationToken = `${input}.${createHmac('sha256', process.env.APP_AUTH_SECRET!).update(input).digest('base64url')}`
    } finally {
      await sql.end()
    }
  })
  afterAll(() => database.dispose())

  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
    env: {
      DATABASE_URL: database.url,
      APP_ENV: 'demo',
      MAIL_MODE: '',
      MAILTRAP_URL: '',
    },
  })

  it('rejects existing unrelated accounts and all credential-management HTTP operations', async () => {
    const denied = await request('/api/login', { email: 'other@email.test', password })

    expect(denied.status).toBe(401)
    expect(await denied.json()).toEqual({
      error: { code: 'INVALID_CREDENTIALS' },
    })
    expect(denied.headers.get('set-cookie')).toBeNull()

    for (const path of [
      '/api/session',
      '/api/notes',
      '/api/notes/tags',
      '/api/preferences',
    ])
      expect((await request(path, undefined, outsiderCookie)).status, path).toBe(401)

    const cookie = await login(emails[0]!)

    for (const path of [
      '/api/registration',
      '/api/registration/resend',
      '/api/password/forgot',
      '/api/password/reset',
      '/api/password/change',
    ]) {
      const response = await request(path, {
        email: emails[0],
        password,
        token: resetToken,
        currentPassword: password,
        newPassword: 'Changed1!',
      }, cookie)

      expect(response.status, path).toBe(403)
      expect(await response.json()).toEqual({
        error: { code: 'DEMO_RESTRICTED' },
      })
    }

    const verify = await request(`/api/registration/verify?token=${verificationToken}`)

    expect(verify.status).toBe(403)
    expect(await verify.json()).toEqual({
      error: { code: 'DEMO_RESTRICTED' },
    })
  })

  it('preserves ownership across the note lifecycle, search, tags, and appearance', async () => {
    const first = await login(emails[0]!)
    const second = await login(emails[1]!)
    const created = await request('/api/notes', {
      title: 'Private journey',
      content: 'Searchable trail',
      tags: ['Separation'],
    }, first)

    let note = await created.json()

    expect(created.status).toBe(201)
    expect((await (await request('/api/notes?q=Searchable', undefined, second)).json()).notes).toEqual([])
    expect(JSON.stringify(await (await request('/api/notes/tags', undefined, second)).json())).not.toContain('Separation')
    expect((await (await request('/api/notes?tag=Separation', undefined, first)).json()).notes.map((item: { id: string }) => item.id)).toContain(note.id)

    for (const [path, method, body] of [
      [`/api/notes/${note.id}`, 'GET', undefined],
      [
        `/api/notes/${note.id}`,
        'PUT',
        {
          title: 'Hijacked',
          content: '',
          tags: [],
          version: note.version,
        },
      ],
      [
        `/api/notes/${note.id}/archive`,
        'POST',
        { version: note.version },
      ],
      [
        `/api/notes/${note.id}/restore`,
        'POST',
        { version: note.version },
      ],
      [
        `/api/notes/${note.id}`,
        'DELETE',
        { version: note.version },
      ],
    ] as const) {
      expect((await request(path, body, second, method)).status, path).toBe(404)
    }

    note = await (await request(`/api/notes/${note.id}`, {
      title: 'Edited journey',
      content: 'Updated trail',
      tags: ['Separation'],
      version: note.version,
    }, first, 'PUT')).json()
    note = await (await request(`/api/notes/${note.id}/archive`, { version: note.version }, first)).json()
    expect(note.isArchived).toBe(true)
    note = await (await request(`/api/notes/${note.id}/restore`, { version: note.version }, first)).json()
    expect(note.isArchived).toBe(false)
    expect((await request(`/api/notes/${note.id}`, { version: note.version }, first, 'DELETE')).status).toBe(204)

    const session = await (await request('/api/session', undefined, first)).json()
    const saved = await fetch(url('/api/preferences'), {
      method: 'PUT',
      headers: {
        'cookie': first,
        'origin': 'http://localhost:3000',
        'content-type': 'application/json',
        'x-expected-account-id': session.user.id,
      },
      body: JSON.stringify({ theme: 'dark', font: 'noto-serif' }),
    })

    expect(saved.status).toBe(200)
    expect(await (await request('/api/preferences', undefined, second)).json()).toEqual({ theme: 'system', font: 'inter' })
    expect(provision().status).toBe(0)
    expect(await (await request('/api/preferences', undefined, first)).json()).toEqual({ theme: 'dark', font: 'noto-serif' })
  })

  it('requires explicit operator scope and refuses collisions atomically', async () => {
    expect(provision(database.url, { APP_ENV: 'development' }).status).not.toBe(0)
    expect(provision(database.url, {}, 'wrong-database').status).not.toBe(0)
    expect(provision(database.url, { DEMO_PASSWORD_1: 'Different1!' }).status).not.toBe(0)

    const collision = isolatedHTTPDatabase()

    await collision.prepare()

    const sql = postgres(collision.url)

    try {
      await sql`INSERT INTO "user" (id, name, email, email_verified) VALUES ('unrelated-owner', 'Existing user', ${emails[1]!}, true)`
      expect(provision(collision.url).status).not.toBe(0)
      // Remove only the synthetic collision; a subsequent create-only run must
      // still create both complete baselines (the failed attempt was atomic).
      await sql`DELETE FROM "user" WHERE id = 'unrelated-owner'`
      expect(provision(collision.url).status).toBe(0)
    } finally {
      await sql.end()
      await collision.dispose()
    }
  })

  it('shows the demo notice and redirects restricted pages without rendering their flows', async () => {
    const html = await (await request('/login')).text()

    expect(html).toContain('Shared demo')
    expect(html).toContain('00:00 UTC')
    expect(html).not.toContain('Forgot password?')
    expect(html).not.toContain('Sign Up')

    for (const path of [
      '/signup',
      '/check-email?required=1',
      '/forgot-password',
      '/reset-password?token=old',
    ]) {
      const response = await request(path)

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/login')
    }

    const cookie = await login(emails[1]!)
    const settings = await (await request('/?panel=settings&setting=password', undefined, cookie)).text()

    expect(settings).toContain('Shared demo')
    expect(settings).not.toContain('Change Password')
    expect(settings).not.toContain('Current Password')

    for (const path of ['/__test/mail', '/__test/auth-state', '/__test/note-state'])
      expect((await request(path)).status).toBe(404)
  })

  it('starts without mail and provisions two verified accounts with distinct baselines without overwriting visitor changes', async () => {
    const first = await login(emails[0]!)
    const second = await login(emails[1]!)
    const firstNotes = await (await request('/api/notes', undefined, first)).json()
    const secondNotes = await (await request('/api/notes', undefined, second)).json()

    expect(firstNotes.notes).toHaveLength(3)
    expect(secondNotes.notes).toHaveLength(3)
    expect(new Set([
      ...firstNotes.notes,
      ...secondNotes.notes,
    ].map(note => note.title)).size).toBe(6)
    expect(await (await request('/api/preferences', undefined, second)).json()).toEqual({ theme: 'system', font: 'inter' })

    const created = await request('/api/notes', {
      title: 'Visitor work',
      content: 'Keep this',
      tags: ['visitor'],
    }, first)

    expect(created.status).toBe(201)

    const rerun = provision()

    expect(rerun.status, rerun.stderr).toBe(0)
    expect((await (await request('/api/notes', undefined, first)).json()).notes).toHaveLength(4)
  })
})
