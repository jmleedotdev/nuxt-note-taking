import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

async function register(page: import('@playwright/test').Page, ip: string) {
  await page.setExtraHTTPHeaders({ 'x-real-ip': ip })

  const email = `appearance-${randomUUID()}@example.test`
  const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': ip }

  expect((await page.request.post('/api/registration', {
    headers,
    data: { email, password: 'Abcdef1!' },
  })).status()).toBe(202)

  const messages = await (await page.request.get('/__test/mail')).json() as { to: string, text: string }[]
  const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

  await page.request.get(link.pathname + link.search)
  expect((await page.request.post('/api/login', {
    headers,
    data: { email, password: 'Abcdef1!' },
  })).status()).toBe(200)
  await page.goto('/')

  return email
}

async function settings(page: import('@playwright/test').Page, section: string) {
  await page.getByRole('link', { name: 'Settings', exact: true }).filter({ visible: true }).first().click()
  await page.getByRole('link', { name: section, exact: true }).filter({ visible: true }).click()
}

test('explicit appearance saves persist across reloads and a different device session', async ({ page, goto, browser }, testInfo) => {
  if (testInfo.project.name !== 'desktop') {
    await page.setViewportSize({
      width: testInfo.project.name === 'mobile'
        ? 375
        : 768,
      height: 1024,
    })
  }

  await goto('/login', { waitUntil: 'hydration' })

  const email = await register(page, `198.18.15.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}`)

  await settings(page, 'Color Theme')
  await expect(page.getByRole('radio', { name: /^System/ })).toBeChecked()
  expect(await page.evaluate(async () => (await document.fonts.load('14px "Inter"')).length)).toBeGreaterThan(0)
  await page.screenshot({
    path: test.info().outputPath('settings-theme-light.png'),
    fullPage: true,
  })
  await page.getByRole('radio', { name: /^Dark Mode/ }).click()
  expect(await (await page.request.get('/api/preferences')).json()).toEqual({ theme: 'system', font: 'inter' })
  await page.getByRole('button', { name: 'Apply Changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Appearance saved to your account.' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('link', { name: 'Settings', exact: true }).filter({ visible: true }).first().click()
  await page.getByRole('link', { name: 'Font Theme', exact: true }).filter({ visible: true }).click()
  await page.getByRole('radio', { name: /Noto Serif/ }).click()
  await page.getByRole('button', { name: 'Apply Changes' }).click()
  await expect(page.locator('body')).toHaveCSS('font-family', /Noto Serif/)
  await expect(page.getByRole('button', { name: 'Apply Changes' })).toHaveCSS('font-family', /Noto Serif/)
  expect(await page.evaluate(async () => (await document.fonts.load('14px "Noto Serif"')).length)).toBeGreaterThan(0)
  await page.reload()
  await expect(page.getByRole('radio', { name: /Noto Serif/ })).toBeChecked()

  const device = await browser.newContext()
  const second = await device.newPage()

  await second.setExtraHTTPHeaders({ 'x-real-ip': `198.18.16.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` })

  try {
    await second.goto(new URL('/login', page.url()).href)
    await second.getByLabel('Email Address', { exact: true }).fill(email)
    await second.getByLabel('Password', { exact: true }).fill('Abcdef1!')
    await second.getByRole('button', { name: 'Login', exact: true }).click()
    await expect(second).toHaveURL(/\/$/)
    await expect(second.locator('html')).toHaveClass(/dark/)
    await expect(second.locator('body')).toHaveCSS('font-family', /Noto Serif/)
  } finally {
    await device.close()
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('settings-font-dark.png'),
    fullPage: true,
  })
})

test('System follows device changes, keyboard controls save fonts, and public pages remember appearance without leaking it into another account', async ({ page, goto }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })

  const ip = { desktop: 11, tablet: 12, mobile: 13 }[testInfo.project.name]
  const email = await register(page, `198.18.15.${ip}`)

  await settings(page, 'Color Theme')
  await expect(page.getByRole('radio', { name: /^System/ })).toBeChecked()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('radio', { name: /^Light Mode/ }).focus()
  await page.keyboard.down('ArrowDown')
  await expect(page.getByRole('radio', { name: /^Dark Mode/ })).toBeChecked()
  await page.keyboard.up('ArrowDown')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Apply Changes' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('radio', { name: /^Dark Mode/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await settings(page, 'Font Theme')
  await page.getByRole('radio', { name: /Inter/ }).focus()
  await page.keyboard.down('ArrowDown')
  await expect(page.getByRole('radio', { name: /Noto Serif/ })).toBeChecked()
  await page.keyboard.up('ArrowDown')
  await page.keyboard.down('ArrowDown')
  await expect(page.getByRole('radio', { name: /Source Code Pro/ })).toBeChecked()
  await page.keyboard.up('ArrowDown')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Apply Changes' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Apply Changes' })).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('radio', { name: /Source Code Pro/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('body')).toHaveCSS('font-family', /Source Code Pro/)
  expect(await page.evaluate(async () => (await document.fonts.load('14px "Source Code Pro"')).length)).toBeGreaterThan(0)
  await page.screenshot({
    path: test.info().outputPath('settings-monospace-dark.png'),
    fullPage: true,
  })

  await page.getByRole('button', { name: 'Log out', exact: true }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByLabel('Email Address', { exact: true })).toHaveCSS('font-family', /Source Code Pro/)
  await page.reload()
  await expect(page.locator('body')).toHaveCSS('font-family', /Source Code Pro/)
  await expect(page.locator('html')).toHaveClass(/dark/)

  for (const path of ['/signup', '/check-email?required=1', '/login']) {
    await page.goto(path)
    await expect(page.locator('body')).toHaveCSS('font-family', /Source Code Pro/)
    await expect(page.locator('html')).toHaveClass(/dark/)
  }

  const remembered = (await page.context().cookies()).find(cookie => cookie.name === 'notes-appearance')!

  expect(JSON.parse(decodeURIComponent(remembered.value))).toEqual({ theme: 'dark', font: 'source-code-pro' })
  await register(page, `198.18.15.${ip! + 20}`)
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/)
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Log out', exact: true }).filter({ visible: true }).first().click()
  await page.getByLabel('Email Address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('body')).toHaveCSS('font-family', /Source Code Pro/)
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('load, validation and persistence failures never claim a save or lose the chosen options', async ({ page, goto }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })

  const email = await register(page, `198.18.15.${{ desktop: 51, tablet: 52, mobile: 53 }[testInfo.project.name]}`)

  await page.getByRole('button', { name: 'Log out', exact: true }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/\/login$/)
  await page.route('**/api/preferences', route => route.fulfill({
    status: 503,
    json: {
      error: { code: 'PREFERENCES_UNAVAILABLE' },
    },
  }))
  await page.getByLabel('Email Address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('alert')).toContainText('could not load your account appearance')
  await settings(page, 'Color Theme')
  await expect(page.getByRole('alert')).toContainText('Try again before making changes')
  await expect(page.getByRole('button', { name: 'Apply Changes' })).toHaveCount(0)
  await page.unroute('**/api/preferences')

  let release!: () => void

  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  await page.route('**/api/preferences', async (route) => {
    await gate
    await route.continue()
  })
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Loading your account appearance' })).toBeVisible()
  release()
  await expect(page.getByRole('radio', { name: /^System/ })).toBeChecked()
  await page.unroute('**/api/preferences')
  await page.getByRole('radio', { name: /^Dark Mode/ }).click()

  const remembered = (await page.context().cookies()).find(cookie => cookie.name === 'notes-appearance')!.value

  for (const status of [422, 503]) {
    await page.route('**/api/preferences', route => route.fulfill({
      status,
      json: {
        error: {
          code: status === 422
            ? 'VALIDATION'
            : 'PREFERENCES_UNAVAILABLE',
        },
      },
    }))
    await page.getByRole('button', { name: 'Apply Changes' }).click()
    await expect(page.getByRole('alert')).toContainText(status === 422
      ? 'Choose an available option'
      : 'Your choices are still here')
    await expect(page.getByRole('radio', { name: /^Dark Mode/ })).toBeChecked()
    await expect(page.getByText('Appearance saved to your account.', { exact: true })).toHaveCount(0)
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    expect((await page.context().cookies()).find(cookie => cookie.name === 'notes-appearance')!.value).toBe(remembered)
    await page.unroute('**/api/preferences')
    expect(await (await page.request.get('/api/preferences')).json()).toEqual({ theme: 'system', font: 'inter' })
  }

  await page.getByRole('button', { name: 'Apply Changes' }).click()
  await expect(page.getByText('Appearance saved to your account.', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('a delayed save response from a logged-out account cannot replace the next account appearance', async ({ page, goto }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })

  const ip = { desktop: 71, tablet: 72, mobile: 73 }[testInfo.project.name]!
  const first = await register(page, `198.18.15.${ip}`)

  await page.getByRole('button', { name: 'Log out', exact: true }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/\/login$/)

  const second = await register(page, `198.18.15.${ip + 10}`)

  await page.getByRole('button', { name: 'Log out', exact: true }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email Address', { exact: true }).fill(first)
  await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await settings(page, 'Font Theme')
  await page.getByRole('radio', { name: /Source Code Pro/ }).click()

  let release!: () => void

  let persisted!: () => void

  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const saved = new Promise<void>((resolve) => {
    persisted = resolve
  })

  await page.route('**/api/preferences', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()

      return
    }

    const response = await route.fetch()

    persisted()
    await gate
    await route.fulfill({ response })
  })

  try {
    await page.getByRole('button', { name: 'Apply Changes' }).click()
    await saved
    await expect(page.getByRole('radio', { name: /Source Code Pro/ })).toBeDisabled()
    await page.getByRole('button', { name: 'Log out', exact: true }).filter({ visible: true }).first().click()
    await expect(page).toHaveURL(/\/login$/)
    await page.getByLabel('Email Address', { exact: true }).fill(second)
    await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
    await page.getByRole('button', { name: 'Login', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)

    const delivered = page.waitForResponse(response => response.url().endsWith('/api/preferences') && response.request().method() === 'PUT')

    release()
    await delivered
    await expect(page.locator('body')).toHaveCSS('font-family', /Inter/)
    expect(await (await page.request.get('/api/preferences')).json()).toEqual({ theme: 'system', font: 'inter' })

    const remembered = (await page.context().cookies()).find(cookie => cookie.name === 'notes-appearance')!

    expect(JSON.parse(decodeURIComponent(remembered.value))).toEqual({ theme: 'system', font: 'inter' })
    await expect(page.getByText('Appearance saved to your account.', { exact: true })).toHaveCount(0)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
  }
})

test('a stale tab cannot save into the account selected in another tab', async ({ page, goto }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })

  const ip = { desktop: 91, tablet: 92, mobile: 93 }[testInfo.project.name]!

  await register(page, `198.18.15.${ip}`)
  await settings(page, 'Font Theme')
  await page.getByRole('radio', { name: /Source Code Pro/ }).click()

  const other = await page.context().newPage()

  try {
    await other.goto(new URL('/', page.url()).href)
    await other.getByRole('button', { name: 'Log out', exact: true }).filter({ visible: true }).first().click()
    await expect(other).toHaveURL(/\/login$/)
    await register(other, `198.18.15.${ip + 10}`)
    await page.getByRole('button', { name: 'Apply Changes' }).click()
    await expect(page.getByRole('alert')).toContainText('Your signed-in account changed')
    await expect(page.getByText('Appearance saved to your account.', { exact: true })).toHaveCount(0)
    expect(await (await other.request.get('/api/preferences')).json()).toEqual({ theme: 'system', font: 'inter' })

    const reloaded = page.waitForEvent('load')

    await page.getByRole('button', { name: 'Reload account', exact: true }).click()
    await reloaded
    await expect(page.getByRole('radio', { name: /Inter/ })).toBeChecked()
    await expect(page.locator('body')).toHaveCSS('font-family', /Inter/)
  } finally {
    await other.close()
  }
})
