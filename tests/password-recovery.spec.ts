import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'
import { expectKeyboardOrder, togglePasswordWithKeyboard } from './helpers/keyboard'

test('recovers through captured mail and requires fresh login on every device', async ({ page, goto, browser }) => {
  test.setTimeout(60000)

  const email = `recovery-${randomUUID()}@example.test`
  const password = 'Original1!'
  const newPassword = 'Replacement2!'

  await goto('/login', { waitUntil: 'hydration' })

  const origin = new URL(page.url()).origin

  expect((await page.request.post('/api/registration', {
    headers: { origin },
    data: { email, password },
  })).status()).toBe(202)

  const messages = await (await page.request.get('/__test/mail')).json() as { to: string, text: string }[]
  const verification = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

  await goto(verification.pathname + verification.search, { waitUntil: 'hydration' })
  expect((await page.request.post('/api/login', {
    headers: { origin },
    data: { email, password },
  })).status()).toBe(200)

  const copied = await page.context().cookies()
  const otherDevice = await browser.newContext({ baseURL: origin })

  try {
    await otherDevice.addCookies(copied)
    await page.reload()
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
    await expectKeyboardOrder(page, [
      page.getByLabel('Email Address', { exact: true }),
      page.getByRole('button', { name: 'Send reset link', exact: true }),
      page.getByRole('link', { name: 'Back to login', exact: true }),
    ])
    await page.getByLabel('Email Address', { exact: true }).fill(email)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'If an account exists' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Send again \(/ })).toBeDisabled()

    let reset: URL | undefined

    await expect.poll(async () => {
      const captured = await (await page.request.get('/__test/mail')).json() as { to: string, subject: string, text: string }[]
      const message = captured.find(message => message.to === email && message.subject.includes('Reset'))

      reset = message
        ? new URL(message.text.match(/https?:\/\/\S+/)![0])
        : undefined

      return Boolean(reset)
    }).toBe(true)

    await goto(reset!.pathname + reset!.search, { waitUntil: 'hydration' })
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
    await expectKeyboardOrder(page, [
      page.getByLabel('New Password', { exact: true }),
      page.getByRole('button', { name: 'Show new password', exact: true }),
      page.getByLabel('Confirm Password', { exact: true }),
      page.getByRole('button', { name: 'Show confirm password', exact: true }),
      page.getByRole('button', { name: 'Reset password', exact: true }),
      page.getByRole('link', { name: 'Request a new link', exact: true }),
      page.getByRole('link', { name: 'Back to login', exact: true }),
    ])
    await togglePasswordWithKeyboard(page, page.getByLabel('New Password', { exact: true }), 'new password')
    await togglePasswordWithKeyboard(page, page.getByLabel('Confirm Password', { exact: true }), 'confirm password')
    await page.getByLabel('New Password', { exact: true }).fill('has spaces')
    await page.getByLabel('Confirm Password', { exact: true }).fill('has spaces')
    await page.getByRole('button', { name: 'Reset password', exact: true }).click()
    await expect(page.getByText('Use 8–128 characters:', { exact: false })).toBeVisible()
    await page.getByLabel('New Password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm Password', { exact: true }).fill('mismatch')
    await page.getByRole('button', { name: 'Reset password', exact: true }).click()
    await expect(page.getByText('Passwords must match.', { exact: true })).toBeVisible()
    await page.getByLabel('Confirm Password', { exact: true }).fill(newPassword)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: test.info().outputPath('reset-password.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Reset password', exact: true }).click()
    await expect(page).toHaveURL(/\/login\?reset=1$/)
    await expect(page.getByRole('status').filter({ hasText: 'Password reset' })).toBeVisible()
    expect((await page.request.get('/api/session')).status()).toBe(401)
    expect((await otherDevice.request.get('/api/session')).status()).toBe(401)
    await page.reload()
    await expect(page.getByRole('status').filter({ hasText: 'Password reset' })).toBeVisible()
    await page.getByLabel('Email Address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Login', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    await goto(reset!.pathname + reset!.search, { waitUntil: 'hydration' })
    await page.getByLabel('New Password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm Password', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Reset password', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('invalid, expired, already used, or replaced')
    await page.getByRole('link', { name: 'Request a new link', exact: true }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
  } finally {
    await otherDevice.close()
  }
})

test('invalid reset links offer recovery without exposing a secret or requiring a session', async ({ page, goto }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await goto('/reset-password?token=invalid', { waitUntil: 'hydration' })
  await expect(page.getByRole('alert')).toContainText('invalid')
  await expect(page.getByLabel('New Password', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Request a new link', exact: true }).click()
  await page.getByLabel('Email Address', { exact: true }).fill(`absent-${randomUUID()}@example.test`)
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'If an account exists' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('forgot-password-dark.png'),
    fullPage: true,
  })
  await page.reload()
  await expect(page.getByLabel('Email Address', { exact: true })).toHaveValue('')
})
