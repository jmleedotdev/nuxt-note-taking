import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const runner = fileURLToPath(new URL('../../scripts/test-database.ts', import.meta.url))
const loader = import.meta.resolve('tsx')

it.each([
  ['missing test file', undefined],
  ['test file without a database URL', '# Configure a test cluster here.\n'],
  ['empty test database URL', 'DATABASE_URL=\n'],
])('fails closed with %s instead of loading the app .env', (_name, testEnv) => {
  const cwd = mkdtempSync(join(tmpdir(), 'notes-test-env-'))
  const env = { ...process.env }

  delete env.DATABASE_URL

  try {
    writeFileSync(join(cwd, '.env'), 'DATABASE_URL=not-a-database-url\n')

    if (testEnv !== undefined) {
      writeFileSync(join(cwd, '.env.test.local'), testEnv)
    }

    const result = spawnSync(process.execPath, ['--import', loader, runner], {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 10000,
    })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Set DATABASE_URL directly or in .env.test.local to an isolated PostgreSQL cluster')
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
