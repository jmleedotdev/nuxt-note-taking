import type { Note } from '../../shared/types/note'
import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { provisionDemo } from '../../server/demo/provision'
import { isolatedHTTPDatabase } from '../fixtures/database'

const database = isolatedHTTPDatabase()
const password = 'PublicTest1!'
const emails = ['demo1@email.test', 'demo2@email.test']

function request(path: string, body?: object, cookie = '', method = body ? 'POST' : 'GET', extraHeaders = {}) {
  return fetch(url(path), {
    method,
    headers: {
      cookie,
      'origin': 'http://localhost:3000',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    ...(body
      ? {
          body: JSON.stringify(body),
        }
      : {}),
  })
}

async function login(email = emails[0]!) {
  const response = await request('/api/login', { email, password })

  expect(response.status).toBe(200)

  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
}

async function control(body: object) {
  const response = await request('/__test/demo-lifecycle', body)

  expect(response.status).toBe(200)
}

describe('daily demo lifecycle over HTTP and PostgreSQL', async () => {
  beforeAll(async () => {
    await database.prepare()

    const sql = postgres(database.url)

    try {
      await provisionDemo(sql, [password, password])
      await sql`CREATE TABLE test_demo_clock (instant timestamptz NOT NULL)`
      await sql`INSERT INTO test_demo_clock VALUES ('2030-01-01T23:59:59Z')`
    } finally {
      await sql.end()
    }
  })
  beforeEach(async () => {
    const sql = postgres(database.url)

    try {
      await sql`DELETE FROM registration_limit`
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
    nuxtConfig: {
      alias: {
        '#demo-clock': fileURLToPath(new URL('../fixtures/demo-clock.ts', import.meta.url)),
      },
      nitro: {
        handlers: [
          {
            route: '/__test/demo-lifecycle',
            handler: fileURLToPath(new URL('../fixtures/demo-lifecycle.ts', import.meta.url)),
          },
        ],
      },
    },
  })

  it('restores both baselines and preferences at midnight before admitting access, preserving credentials and identities', async () => {
    const cookies = await Promise.all(emails.map(email => login(email)))
    const identities = []
    const originals: string[] = []
    const baselineDetails = (notes: Note[]) => JSON.stringify(notes.map(({ title, content, tags, isArchived }) => ({ title, content, tags, isArchived })).sort((a, b) => a.title.localeCompare(b.title)))

    for (const cookie of cookies) {
      const session = await (await request('/api/session', undefined, cookie)).json()

      identities.push(session.user)

      const samples: Note[] = (await (await request('/api/notes', undefined, cookie)).json()).notes

      originals.push(baselineDetails(samples))
      expect((await request(`/api/notes/${samples[0]!.id}`, {
        title: 'Changed sample',
        content: 'Replaced content',
        tags: ['Visitor'],
        version: samples[0]!.version,
      }, cookie, 'PUT')).status).toBe(200)
      expect((await request(`/api/notes/${samples[1]!.id}/archive`, { version: samples[1]!.version }, cookie)).status).toBe(200)
      expect((await request(`/api/notes/${samples[2]!.id}`, { version: samples[2]!.version }, cookie, 'DELETE')).status).toBe(204)
      expect((await request('/api/notes', {
        title: 'Visitor work',
        tags: ['Visitor'],
      }, cookie)).status).toBe(201)
      expect((await request('/api/preferences', { theme: 'dark', font: 'noto-serif' }, cookie, 'PUT', { 'x-expected-account-id': session.user.id })).status).toBe(200)
    }

    await control({ now: '2030-01-02T00:00:00Z' })

    for (const cookie of cookies)
      expect((await request('/api/notes', undefined, cookie)).status).toBe(401)

    const titles = [
      ['A weekend outdoors', 'Reading list', 'Small daily habits'],
      ['Kitchen experiments', 'Project sketchbook', 'Story ideas'],
    ]

    for (const [index, email] of emails.entries()) {
      const cookie = await login(email)

      expect((await (await request('/api/session', undefined, cookie)).json()).user).toEqual(identities[index])

      const notes = (await (await request('/api/notes', undefined, cookie)).json()).notes

      expect(notes.map((note: { title: string }) => note.title).sort()).toEqual(titles[index])
      expect(baselineDetails(notes)).toBe(originals[index])
      expect((await (await request('/api/notes?archived=true', undefined, cookie)).json()).notes).toEqual([])
      expect(await (await request('/api/preferences', undefined, cookie)).json()).toEqual({ theme: 'system', font: 'inter' })
      expect(JSON.stringify(await (await request('/api/notes/tags', undefined, cookie)).json())).not.toContain('Visitor')
    }
  })

  it('restores only the current day after missed jobs and makes duplicate/concurrent resets harmless', async () => {
    const oldCookie = await login()

    await control({ now: '2030-01-09T12:00:00Z' })

    // Login itself must restore the day, without a protected request or cron first.
    const cookie = await login()

    expect((await request('/api/session', undefined, oldCookie)).status).toBe(401)
    expect((await request('/api/notes', { title: 'Keep current-day work' }, cookie)).status).toBe(201)

    const before = await (await request('/api/notes', undefined, cookie)).json()

    await Promise.all(Array.from({ length: 8 }, () => control({ reset: true })))
    expect(await (await request('/api/notes', undefined, cookie)).json()).toEqual(before)
    expect((await request('/api/session', undefined, cookie)).status).toBe(200)

    await control({ now: '2030-01-10T00:00:00Z' })
    await Promise.all(Array.from({ length: 8 }, () => control({ reset: true })))
    expect((await request('/api/session', undefined, cookie)).status).toBe(401)

    const current = await login()

    expect((await (await request('/api/notes', undefined, current)).json()).notes).toHaveLength(3)
  })

  it('denies access on reset failure and atomically recovers both accounts without touching unrelated data', async () => {
    const sql = postgres(database.url)

    try {
      const cookie = await login()
      const other = await login(emails[1]!)

      await request('/api/notes', { title: 'Before failed reset' }, cookie)
      await request('/api/notes', { title: 'Other account before failure' }, other)
      await sql`INSERT INTO "user" (id, name, email, email_verified) VALUES ('lifecycle-outsider', 'Other', 'outside@email.test', true)`
      await sql`INSERT INTO notes (owner_id, title) VALUES ('lifecycle-outsider', 'Never reset')`
      await sql`INSERT INTO session (id, token, user_id, expires_at) VALUES ('unrelated-lifecycle-session', 'unrelated-lifecycle-token', 'lifecycle-outsider', now() + interval '1 day')`
      await sql.unsafe(`
        CREATE FUNCTION test_reset_failure() RETURNS trigger AS $$
        BEGIN
          IF OLD.owner_id = 'portfolio-demo-writer' THEN RAISE EXCEPTION 'Synthetic reset failure'; END IF;
          RETURN OLD;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER test_reset_failure BEFORE DELETE ON notes FOR EACH ROW EXECUTE FUNCTION test_reset_failure();
      `)
      await control({ now: '2030-01-11T00:00:00Z' })
      expect((await request('/api/login', { email: emails[0], password })).status).toBe(503)

      for (const path of ['/api/session', '/api/notes', '/api/preferences'])
        expect((await request(path, undefined, cookie)).status).toBe(503)
      // Rewind only the test clock to inspect the previous day's state via HTTP:
      // the failed transaction must have preserved notes AND both old sessions.
      await control({ now: '2030-01-10T23:59:59Z' })
      expect(JSON.stringify(await (await request('/api/notes', undefined, cookie)).json())).toContain('Before failed reset')
      expect(JSON.stringify(await (await request('/api/notes', undefined, other)).json())).toContain('Other account before failure')
      await control({ now: '2030-01-11T00:00:00Z' })
      await sql`DROP TRIGGER test_reset_failure ON notes`

      const recovered = await login()

      expect((await request('/api/session', undefined, cookie)).status).toBe(401)
      expect((await request('/api/session', undefined, other)).status).toBe(401)

      for (const session of [recovered, await login(emails[1]!)])
        expect((await (await request('/api/notes', undefined, session)).json()).notes).toHaveLength(3)
      // These checks are scope-safety checks for data deliberately inaccessible
      // through demo HTTP, not assertions about the lifecycle table layout.
      expect((await sql`SELECT title FROM notes WHERE owner_id = 'lifecycle-outsider'`).map(row => row.title)).toEqual(['Never reset'])
      expect(await sql`SELECT id FROM session WHERE id = 'unrelated-lifecycle-session'`).toHaveLength(1)
    } finally {
      await sql.end()
    }
  })

  it('rejects a login spanning midnight rather than issuing stale authority', async () => {
    const sql = postgres(database.url, { max: 1 })
    const observer = postgres(database.url)

    let pending: Promise<Response> | undefined

    try {
      await sql.unsafe(`
        CREATE FUNCTION test_login_gate() RETURNS trigger AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('test-demo-login-gate', 0));
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER test_login_gate BEFORE INSERT ON session FOR EACH ROW EXECUTE FUNCTION test_login_gate();
      `)
      await sql`SELECT pg_advisory_lock(hashtextextended('test-demo-login-gate', 0))`
      pending = request('/api/login', { email: emails[0], password })
      await expect.poll(async () => {
        const rows = await observer`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory' AND query ILIKE '%insert into%session%'`

        return rows.length
      }).toBe(1)
      await control({ now: '2030-01-12T00:00:00Z' })

      const reset = control({ reset: true })

      await sql`SELECT pg_advisory_unlock(hashtextextended('test-demo-login-gate', 0))`

      const response = await pending

      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toBeNull()
      await reset

      const current = await login()

      expect((await request('/api/session', undefined, current)).status).toBe(200)
    } finally {
      await sql`SELECT pg_advisory_unlock_all()`
      await pending
      await sql`DROP TRIGGER IF EXISTS test_login_gate ON session`
      await sql.end()
      await observer.end()
    }
  })

  it('cannot commit an old-session write after losing its coordination connection', async () => {
    const sql = postgres(database.url, { max: 1 })
    const observer = postgres(database.url)

    let pending: Promise<Response> | undefined

    try {
      const cookie = await login()
      const session = await (await request('/api/session', undefined, cookie)).json()

      await sql.unsafe(`
        CREATE FUNCTION test_connection_loss_gate() RETURNS trigger AS $$
        BEGIN
          IF NEW.theme = 'dark' THEN
            PERFORM pg_advisory_xact_lock(hashtextextended('test-demo-connection-loss', 0));
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER test_connection_loss_gate BEFORE INSERT ON appearance_preferences FOR EACH ROW EXECUTE FUNCTION test_connection_loss_gate();
      `)
      await sql`SELECT pg_advisory_lock(hashtextextended('test-demo-connection-loss', 0))`
      pending = request('/api/preferences', { theme: 'dark', font: 'noto-serif' }, cookie, 'PUT', { 'x-expected-account-id': session.user.id })
      await expect.poll(async () => {
        const rows = await observer`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory' AND query ILIKE '%insert into%appearance_preferences%'`

        return rows.length
      }).toBe(1)

      // Terminate only the lifecycle lock holder, not the external test gate.
      // It may be idle during a separate-pool write or itself executing the write.
      const terminated = await observer`
        SELECT pg_terminate_backend(a.pid) FROM pg_stat_activity a
        JOIN pg_locks l ON l.pid = a.pid
        WHERE a.datname = current_database() AND l.locktype = 'advisory'
        AND l.granted AND a.pid <> pg_backend_pid()
        AND a.query NOT ILIKE '%pg_advisory_lock(%'
      `

      expect(terminated).toHaveLength(1)
      await control({ advanceDay: true, reset: true })
      await sql`SELECT pg_advisory_unlock(hashtextextended('test-demo-connection-loss', 0))`
      expect((await pending).status).toBe(503)

      const current = await login()

      expect(await (await request('/api/preferences', undefined, current)).json()).toEqual({ theme: 'system', font: 'inter' })
    } finally {
      await sql`SELECT pg_advisory_unlock_all()`
      await pending
      await sql`DROP TRIGGER IF EXISTS test_connection_loss_gate ON appearance_preferences`
      await sql.end()
      await observer.end()
    }
  })

  it('waits for an in-progress reset before creating current-day login authority', async () => {
    const sql = postgres(database.url, { max: 1 })
    const observer = postgres(database.url)

    let reset: Promise<void> | undefined

    let pending: Promise<Response> | undefined

    try {
      const oldCookie = await login()

      await sql.unsafe(`
        CREATE FUNCTION test_reset_gate() RETURNS trigger AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('test-demo-reset-gate', 0));
          RETURN OLD;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER test_reset_gate BEFORE DELETE ON notes FOR EACH ROW EXECUTE FUNCTION test_reset_gate();
      `)
      await sql`SELECT pg_advisory_lock(hashtextextended('test-demo-reset-gate', 0))`
      await control({ advanceDay: true })
      reset = control({ reset: true })
      await expect.poll(async () => {
        const rows = await observer`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory' AND query ILIKE '%delete from notes%'`

        return rows.length
      }).toBe(1)
      pending = request('/api/login', { email: emails[0], password })

      const protectedRequest = request('/api/notes', undefined, oldCookie)
      const duplicate = control({ reset: true })

      await sql`SELECT pg_advisory_unlock(hashtextextended('test-demo-reset-gate', 0))`
      await Promise.all([reset, duplicate])
      expect((await protectedRequest).status).toBe(401)

      const response = await pending

      expect(response.status).toBe(200)

      const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')

      expect((await request('/api/session', undefined, cookie)).status).toBe(200)
      expect((await (await request('/api/notes', undefined, cookie)).json()).notes).toHaveLength(3)
    } finally {
      await sql`SELECT pg_advisory_unlock_all()`
      await reset
      await pending
      await sql`DROP TRIGGER IF EXISTS test_reset_gate ON notes`
      await sql.end()
      await observer.end()
    }
  })

  it.each(['notes', 'preferences'] as const)('coordinates in-flight %s writes with reset and rejects queued stale mutations', async (resource) => {
    const sql = postgres(database.url, { max: 1 })
    const observer = postgres(database.url)
    const table = resource === 'notes'
      ? 'notes'
      : 'appearance_preferences'

    let pending: Promise<Response> | undefined

    let reset: Promise<void> | undefined

    try {
      const cookie = await login()
      const session = await (await request('/api/session', undefined, cookie)).json()
      const sample = (await (await request('/api/notes', undefined, cookie)).json()).notes[0]

      await sql.unsafe(`
        CREATE OR REPLACE FUNCTION test_write_gate() RETURNS trigger AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('test-demo-write-gate', 0));
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER test_write_gate BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION test_write_gate();
      `)
      await sql`SELECT pg_advisory_lock(hashtextextended('test-demo-write-gate', 0))`
      pending = resource === 'notes'
        ? request('/api/notes', {
            title: 'Racing old-day write',
            tags: ['Stale'],
          }, cookie)
        : request('/api/preferences', { theme: 'dark', font: 'noto-serif' }, cookie, 'PUT', { 'x-expected-account-id': session.user.id })
      await expect.poll(async () => {
        const rows = await observer`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory' AND query ILIKE ${`%insert into%${table}%`}`

        return rows.length
      }).toBe(1)
      await control({ advanceDay: true })
      reset = control({ reset: true })

      // Send another old-session operation while the first is in its actual SQL
      // write. Whichever reset contender wins, it must reauthorize afterwards.
      const queued = request('/api/notes', { title: 'Queued stale write' }, cookie)

      await sql`SELECT pg_advisory_unlock(hashtextextended('test-demo-write-gate', 0))`
      expect((await pending).status).toBe(503)
      await reset
      expect((await queued).status).toBe(401)

      for (const [path, body, method] of [
        [
          '/api/notes',
          { title: 'Stale create' },
          'POST',
        ],
        [
          `/api/notes/${sample.id}`,
          { title: 'Stale edit', version: sample.version },
          'PUT',
        ],
        [
          `/api/notes/${sample.id}/archive`,
          { version: sample.version },
          'POST',
        ],
        [
          `/api/notes/${sample.id}/restore`,
          { version: sample.version },
          'POST',
        ],
        [
          `/api/notes/${sample.id}`,
          { version: sample.version },
          'DELETE',
        ],
        [
          '/api/preferences',
          { theme: 'dark', font: 'noto-serif' },
          'PUT',
        ],
      ] as const)
        expect((await request(path, body, cookie, method, { 'x-expected-account-id': session.user.id })).status).toBe(401)

      const current = await login()

      expect((await (await request('/api/notes', undefined, current)).json()).notes).toHaveLength(3)
      expect(JSON.stringify(await (await request('/api/notes/tags', undefined, current)).json())).not.toContain('Stale')
      expect(await (await request('/api/preferences', undefined, current)).json()).toEqual({ theme: 'system', font: 'inter' })
    } finally {
      await sql`SELECT pg_advisory_unlock_all()`
      await pending
      await reset
      await sql.unsafe(`DROP TRIGGER IF EXISTS test_write_gate ON ${table}`)
      await sql.end()
      await observer.end()
    }
  })
})
