import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

test('signup rejects spaces, preserves email, and accepts an ASCII password', async ({ page, goto }, testInfo) => {
  test.setTimeout(60000)
  // Keep the real cooldown check independent of other journeys' shared IP budgets.
  await page.context().setExtraHTTPHeaders({ 'x-real-ip': `198.19.23.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` })
  await goto('/signup', { waitUntil: 'hydration' })
  await expect(page.getByRole('heading', { name: 'Create Your Account' })).toBeVisible()
  await expect(page).toHaveTitle('Sign Up | notes')
  await expect(page.getByRole('img', { name: 'notes', exact: true })).toBeVisible()

  const email = `browser-${randomUUID()}@example.test`

  await page.getByLabel('Email Address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('password with spaces')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page.getByText('Use 8–128 characters: English letters, numbers, and symbols only. No spaces.')).toBeVisible()
  await expect(page.getByLabel('Email Address', { exact: true })).toHaveValue(email)
  await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page).toHaveURL(/\/check-email$/)
  await expect(page).toHaveTitle('Check your email | notes')
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Send again/ })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // Advancing the browser clock must not bypass the real PostgreSQL cooldown.
  await page.clock.install()
  await page.clock.fastForward(31000)
  await expect(page.getByRole('button', { name: 'Send again', exact: true })).toBeEnabled()

  const resendRequest = page.waitForRequest(request => request.url().endsWith('/api/registration/resend'))
  const resendResponse = page.waitForResponse(response => response.url().endsWith('/api/registration/resend'))

  await page.getByRole('button', { name: 'Send again', exact: true }).click()
  expect((await resendRequest).postDataJSON()).toEqual({ email })
  expect((await resendResponse).status()).toBe(429)
  await expect(page.getByRole('status').filter({ hasText: 'Too many attempts.' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Send again/ })).toBeDisabled()

  // Wait for the actual server cooldown before testing an accepted resend.
  await expect(page.getByRole('button', { name: 'Send again', exact: true })).toBeEnabled({ timeout: 35000 })

  const acceptedResend = page.waitForResponse(response => response.url().endsWith('/api/registration/resend'))

  await page.getByRole('button', { name: 'Send again', exact: true }).click()
  expect((await acceptedResend).status()).toBe(202)
  await expect(page.getByRole('main').getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Send again/ })).toBeDisabled()
  await page.reload()
  await expect(page).toHaveURL(/\/login$/)
})

test('signup shows the minimum-length hint and toggles password visibility without Google login', async ({ page, goto }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await goto('/signup', { waitUntil: 'hydration' })
  await expect(page.getByText('At least 8 characters', { exact: true })).toBeVisible()
  await expect(page.getByText('Already have an account?')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toHaveAttribute('href', '/login')
  await expect(page.getByRole('button', { name: /Google/i })).toHaveCount(0)

  const password = page.getByLabel('Password', { exact: true })
  const show = page.getByRole('button', { name: 'Show password', exact: true })

  await expect(password).toHaveAccessibleDescription('At least 8 characters')
  await expect(show.locator('[data-slot="leadingIcon"]')).toHaveCSS('color', 'rgb(153, 160, 174)')
  await expect(show.locator('[data-slot="leadingIcon"]')).toHaveCSS('mask-image', /url\(/)
  await password.fill('Abcdef1!')
  await expect(password).toHaveAttribute('type', 'password')
  await expect(show).toHaveAttribute('aria-pressed', 'false')
  await show.click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('Abcdef1!')

  const hide = page.getByRole('button', { name: 'Hide password', exact: true })

  await expect(hide).toHaveAttribute('aria-pressed', 'true')
  await expect(hide.locator('[data-slot="leadingIcon"]')).toHaveCSS('color', 'rgb(153, 160, 174)')
  await expect(hide.locator('[data-slot="leadingIcon"]')).toHaveCSS('mask-image', /url\(/)
  await hide.click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue('Abcdef1!')
})

test('check-email without email context redirects to login', async ({ page, goto }) => {
  const response = await page.request.get('/check-email', { maxRedirects: 0 })

  expect(response.status()).toBe(302)
  expect(response.headers().location).toBe('/login')
  await goto('/check-email')
  await expect(page).toHaveURL(/\/login$/)
})

test('an invalid verification link without email context offers login, not an email form', async ({ page, goto }) => {
  await goto('/check-email?invalid=1', { waitUntil: 'hydration' })
  await expect(page.getByRole('alert')).toContainText('This link is invalid or has expired.')
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Send/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Back to login', exact: true })).toHaveAttribute('href', '/login')
})

test('auth panel uses the design palette in light and dark mode', async ({ page, goto }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await goto('/signup', { waitUntil: 'hydration' })

  const main = page.getByRole('main')

  await expect(main).toHaveCSS('background-color', 'rgb(243, 245, 248)')
  await expect(main).toHaveCSS('color', 'rgb(14, 18, 27)')
  await expect(page.getByRole('button', { name: 'Sign up', exact: true })).toHaveCSS('background-color', 'rgb(51, 92, 255)')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(main).toHaveCSS('background-color', 'rgb(14, 18, 27)')
  await expect(main).toHaveCSS('color', 'rgb(255, 255, 255)')
})
