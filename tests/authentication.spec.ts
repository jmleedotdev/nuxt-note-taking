import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

test('signup, unverified recovery, verification, login, SSR shell, and logout', async ({ page, goto }) => {
  test.setTimeout(60000)

  const email = `journey-${randomUUID()}@example.test`

  await goto('/signup', { waitUntil: 'hydration' })
  await page.getByLabel('Email Address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page).toHaveURL(/\/check-email$/)
  await page.getByRole('link', { name: 'Back to sign up' }).click()
  await page.getByRole('link', { name: 'Login', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to Note' })).toBeVisible()
  await page.getByLabel('Email Address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/check-email$/)
  await expect(page.getByText(email, { exact: true })).toBeVisible()

  const messages = await (await page.request.get('/__test/mail')).json() as { to: string, text: string }[]
  const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

  await goto(link.pathname + link.search, { waitUntil: 'hydration' })
  await expect(page).toHaveURL(/\/login\?verified=1$/)
  await expect(page.getByRole('status').filter({ hasText: 'Email verified' })).toBeVisible()
  await page.screenshot({
    path: test.info().outputPath('verified-login.png'),
  })
  await page.getByLabel('Email Address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'All Notes', exact: true })).toBeVisible()
  await expect(page.getByText('You don’t have any notes yet.', { exact: false })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'All Notes', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('authenticated-shell.png'),
    fullPage: true,
  })

  const cookie = (await page.context().cookies()).find(value => value.name.includes('session_token'))!

  expect(cookie.httpOnly).toBe(true)
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/login$/)

  const rejected = await page.request.get('/api/session', {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
  })

  expect(rejected.status()).toBe(401)
})

test('login asks for a password without listing signup requirements', async ({ page, goto }) => {
  await goto('/login', { waitUntil: 'hydration' })
  await expect(page.getByRole('button', { name: 'Send verification email', exact: true })).toHaveCount(0)
  await page.getByLabel('Email Address', { exact: true }).fill('login@example.test')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page.getByText('Enter a password.', { exact: true })).toBeVisible()
  await expect(page.getByText('Use 8–128 characters:', { exact: false })).toHaveCount(0)
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page.getByText('Enter a password.', { exact: true })).toBeVisible()
})

test('invalid verification recovers through credentials to rate-limited resend without signing in', async ({ page, goto }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await goto('/api/registration/verify?token=invalid', { waitUntil: 'hydration' })
  await expect(page.getByRole('alert')).toContainText('invalid or has expired')
  await expect(page.getByText('Enter your email and password on the login page to request a new verification link.')).toBeVisible()

  const email = `recovery-${randomUUID()}@example.test`
  const registered = await page.request.post('/api/registration', {
    headers: { origin: new URL(page.url()).origin },
    data: { email, password: 'Abcdef1!' },
  })

  expect(registered.status()).toBe(202)
  await page.getByRole('link', { name: 'Back to login' }).click()
  await expect(page.getByRole('button', { name: 'Send verification email', exact: true })).toHaveCount(0)
  await page.getByLabel('Email Address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
  await page.screenshot({
    path: test.info().outputPath('recovery-login-dark.png'),
  })
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/check-email$/)
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  expect((await page.request.get('/api/session')).status()).toBe(401)

  const resend = page.waitForResponse(response => response.url().endsWith('/api/registration/resend'))

  await page.getByRole('button', { name: 'Send again', exact: true }).click()
  expect((await resend).status()).toBe(429)
  await expect(page.getByRole('button', { name: /Send again/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Send again \(/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
