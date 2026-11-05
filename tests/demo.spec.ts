import { spawnSync } from 'node:child_process'
import { expect, test } from '@nuxt/test-utils/playwright'

const password = 'PublicTest1!'

test.beforeAll(() => {
  const database = new URL(process.env.DATABASE_URL!)

  if (!database.pathname.startsWith('/notes_test_'))
    throw new Error('Demo browser tests require the disposable database runner')

  const result = spawnSync('pnpm', [
    'exec',
    'tsx',
    'scripts/provision-demo.ts',
    '--confirm-database',
    database.pathname.slice(1),
  ], {
    env: { ...process.env, DEMO_PASSWORD_1: password, DEMO_PASSWORD_2: password },
    encoding: 'utf8',
  })

  expect(result.status, result.stderr).toBe(0)
})

test('ordinary demo login, restricted navigation, settings, and responsive full-width notice', async ({ page, goto }) => {
  await goto('/login', { waitUntil: 'hydration' })

  const notice = page.getByRole('complementary', { name: 'Demo notice' })

  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Don\'t enter personal information')
  await expect(notice).toContainText('00:00 UTC')
  await expect(notice).toContainText('unsaved work may be lost')
  await expect(notice.getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Sign Up' })).toHaveCount(0)

  for (const path of [
    '/signup',
    '/check-email',
    '/forgot-password',
    '/reset-password?token=old',
  ]) {
    await goto(path, { waitUntil: 'hydration' })
    await expect(page).toHaveURL(/\/login$/)
  }

  await page.getByLabel('Email Address', { exact: true }).fill('demo1@email.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(notice).toBeVisible()
  await expect(page.getByRole('heading', { name: 'All Notes', exact: true })).toBeVisible()

  const bounds = await notice.boundingBox()
  const header = await page.locator('header').boundingBox()

  expect(bounds!.x).toBe(0)
  expect(bounds!.width).toBe(page.viewportSize()!.width)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(header!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('demo-notice.png'),
    fullPage: true,
  })

  await goto('/?panel=settings&setting=password', { waitUntil: 'hydration' })
  await expect(page.getByRole('link', { name: 'Change Password' })).toHaveCount(0)
  await expect(page.getByLabel('Current Password', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Color Theme' })).toBeVisible()
  expect((await page.request.post('/api/password/change', {
    data: { currentPassword: password, newPassword: 'Changed1!' },
  })).status()).toBe(403)
})
