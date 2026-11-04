import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

test('settings password change preserves failure feedback and requires fresh login on every device', async ({ page, goto, browser }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })
  await page.setViewportSize({ width: { desktop: 1440, tablet: 768, mobile: 375 }[testInfo.project.name]!, height: 900 })
  await page.setExtraHTTPHeaders({ 'x-real-ip': `198.19.21.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` })

  const email = `change-browser-${randomUUID()}@example.test`
  const origin = new URL(page.url()).origin
  // APIRequestContext does not inherit page-level extra headers.
  const headers = { origin, 'x-real-ip': `198.19.21.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` }

  expect((await page.request.post('/api/registration', {
    headers,
    data: { email, password: 'Original1!' },
  })).status()).toBe(202)

  const messages = await (await page.request.get('/__test/mail')).json() as { to: string, text: string }[]
  const verification = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

  await page.request.get(verification.pathname + verification.search)
  await page.getByLabel('Email Address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Original1!')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  const copied = (await page.context().cookies()).filter(cookie => cookie.name.includes('session_token'))
  const device = await browser.newContext()

  try {
    const second = await device.newPage()

    await second.goto(`${origin}/login`)
    expect((await second.request.post(`${origin}/api/login`, {
      headers: { origin, 'x-real-ip': `198.19.22.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` },
      data: { email, password: 'Original1!' },
    })).status()).toBe(200)
    await second.goto(origin)
    await page.getByRole('link', { name: 'Settings', exact: true }).filter({ visible: true }).first().click()
    await page.getByRole('link', { name: 'Change Password', exact: true }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { name: 'Change Password', exact: true })).toBeVisible()

    const current = page.getByLabel('Current Password', { exact: true })
    const replacement = page.getByLabel('New Password', { exact: true })
    const confirmation = page.getByLabel('Confirm New Password', { exact: true })
    const save = page.getByRole('button', { name: 'Save Password', exact: true })

    await expect(current).toHaveAttribute('autocomplete', 'current-password')
    await expect(replacement).toHaveAttribute('autocomplete', 'new-password')
    await current.fill('Incorrect1!')
    await replacement.fill('Replacement2!')
    await confirmation.fill('Mismatch3!')
    await save.click()
    await expect(page.getByText('Passwords must match.', { exact: true })).toBeVisible()
    await confirmation.fill('Replacement2!')
    await save.click()
    await expect(page.getByRole('alert')).toContainText('Current password is incorrect')
    await expect(replacement).toHaveValue('Replacement2!')
    await current.fill('Original1!')
    await page.getByRole('button', { name: 'Show current password', exact: true }).click()
    await expect(current).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide current password', exact: true }).click()

    await page.route('**/api/password/change', route => route.fulfill({
      status: 503,
      json: {
        error: { code: 'AUTH_UNAVAILABLE' },
      },
    }))
    await save.click()
    await expect(page.getByRole('alert')).toContainText('could not change your password')
    await expect(current).toHaveValue('Original1!')
    expect((await page.request.get('/api/session')).status()).toBe(200)
    await page.unroute('**/api/password/change')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('change-password-light.png'),
      fullPage: true,
    })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.screenshot({
      path: testInfo.outputPath('change-password-dark.png'),
      fullPage: true,
    })
    await save.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/login\?changed=1$/)
    await expect(page.getByRole('status').filter({ hasText: 'Password changed' })).toBeVisible()
    expect((await page.request.get('/api/session')).status()).toBe(401)
    expect((await second.request.get(`${origin}/api/session`)).status()).toBe(401)
    await second.reload()
    await expect(second).toHaveURL(/\/login$/)
    await page.context().addCookies(copied)
    await page.goto('/?panel=settings&setting=password')
    await expect(page).toHaveURL(/\/login$/)
    await page.getByLabel('Email Address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill('Original1!')
    await page.getByRole('button', { name: 'Login', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Email or password is incorrect')
    await page.getByLabel('Password', { exact: true }).fill('Replacement2!')
    await page.getByRole('button', { name: 'Login', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/?panel=settings&setting=password')
    await expect(current).toHaveValue('')
    await expect(replacement).toHaveValue('')
  } finally {
    await device.close()
  }
})
