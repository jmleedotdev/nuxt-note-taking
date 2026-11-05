import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

async function expectNativeShortcut(page: Page, key: string) {
  for (const modifier of ['metaKey', 'ctrlKey']) {
    expect(await page.evaluate(({ key, modifier }) => {
      const event = new KeyboardEvent('keydown', {
        key,
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      })

      return document.activeElement!.dispatchEvent(event)
    }, { key, modifier })).toBe(true)
  }
}

test.beforeEach(async ({ page, goto }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })

  const email = `shortcut-${randomUUID()}@example.test`
  const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': `198.18.35.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` }

  await page.request.post('/api/registration', {
    headers,
    data: { email, password: 'Abcdef1!' },
  })

  const messages = await (await page.request.get('/__test/mail')).json() as { to: string, text: string }[]
  const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

  await page.request.get(link.pathname + link.search)
  await page.request.post('/api/login', {
    headers,
    data: { email, password: 'Abcdef1!' },
  })
  await page.request.post('/api/notes', {
    headers,
    data: {
      title: 'Active reference',
      content: 'Saved needle',
      tags: ['Work'],
    },
  })

  const archived = await (await page.request.post('/api/notes', {
    headers,
    data: {
      title: 'Archived reference',
      content: 'Saved needle',
      tags: ['Archive only'],
    },
  })).json()

  await page.request.post(`/api/notes/${archived.id}/archive`, {
    headers,
    data: { version: 1 },
  })
  await goto('/?panel=search&q=needle', { waitUntil: 'hydration' })
})

test('both desktop bindings select search without navigating, saving, or changing the draft or results', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')

  const search = page.getByRole('searchbox', { name: 'Search notes', exact: true }).filter({ visible: true })

  await page.getByRole('button', { name: 'Active reference', exact: true }).click()

  const content = page.getByRole('textbox', { name: 'Note content', exact: true })

  await content.fill('Unsaved words')

  const url = page.url()
  const requests: string[] = []

  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/notes'))
      requests.push(`${request.method()} ${request.url()}`)
  })

  for (const binding of ['Meta+k', 'Control+k']) {
    await content.focus()
    await page.keyboard.press(binding)
    await expect(search).toBeFocused()
    expect(await search.evaluate((element) => {
      const input = element as HTMLInputElement

      return [input.selectionStart, input.selectionEnd]
    })).toEqual([0, 6])
    await expect(page).toHaveURL(url)
    await expect(content).toHaveValue('Unsaved words')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Active reference', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archived reference', exact: true })).toHaveCount(0)
  }

  expect(requests).toEqual([])
})

test('desktop search submission guards drafts, restores cancelled filters, and replaces tags in active/archive scope', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')

  const search = page.getByRole('searchbox', { name: 'Search notes', exact: true }).filter({ visible: true })

  await page.getByRole('button', { name: 'Active reference', exact: true }).click()

  const content = page.getByRole('textbox', { name: 'Note content', exact: true })

  await content.fill('Unsaved words')

  const url = page.url()

  await page.keyboard.press('Control+k')
  await search.fill('no-match')
  await search.press('Enter')

  const discard = page.getByRole('dialog', { name: 'Discard unsaved note?', exact: true })

  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(search).toHaveValue('needle')
  await expect(content).toHaveValue('Unsaved words')
  await expect(page).toHaveURL(url)
  await page.keyboard.press('Meta+k')
  await search.fill('no-match')
  await search.press('Enter')
  await discard.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByText('No notes match your search.', { exact: false })).toBeVisible()
  await expect(content).toHaveCount(0)

  await page.getByRole('link', { name: 'Tag: Work', exact: true }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/tag=Work/)
  await page.keyboard.press('Control+k')
  await search.fill('needle')
  await search.press('Enter')
  await expect(page).toHaveURL(/q=needle/)
  expect(new URL(page.url()).searchParams.has('tag')).toBe(false)
  await expect(page.getByRole('button', { name: 'Active reference', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archived reference', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Active reference', exact: true }).click()
  await expect(content).toHaveValue('Saved needle')

  await page.getByRole('link', { name: 'Archived Notes', exact: true }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/view=archived/)
  await page.keyboard.press('Meta+k')
  await search.fill('needle')
  await search.press('Enter')
  await expect(page).toHaveURL(/view=archived/)
  await expect(page).toHaveURL(/q=needle/)
  await expect(page.getByRole('button', { name: 'Archived reference', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Active reference', exact: true })).toHaveCount(0)
})

test('desktop shortcuts never escape archive, delete, or unsaved-note modals', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.getByRole('button', { name: 'Active reference', exact: true }).click()

  for (const action of ['Archive Note', 'Delete Note']) {
    await page.getByRole('button', { name: action, exact: true }).click()

    const dialog = page.getByRole('dialog', { name: action, exact: true })

    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await expectNativeShortcut(page, 'k')

    for (const binding of ['Meta+k', 'Control+k']) {
      await page.keyboard.press(binding)
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    }

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  }

  await page.getByRole('textbox', { name: 'Note content', exact: true }).fill('Unsaved words')
  await page.getByRole('link', { name: 'All Notes', exact: true }).filter({ visible: true }).click()

  const keepWriting = page.getByRole('dialog').getByRole('button', { name: 'Keep writing', exact: true })

  await expect(keepWriting).toBeFocused()
  await expectNativeShortcut(page, 'k')

  for (const binding of ['Meta+k', 'Control+k']) {
    await page.keyboard.press(binding)
    await expect(keepWriting).toBeFocused()
  }

  await keepWriting.click()
})

test('small screens retain native shortcuts and search-screen navigation without a desktop hint', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop')

  const search = page.getByRole('searchbox', { name: 'Search notes', exact: true }).filter({ visible: true })

  await search.focus()
  await expectNativeShortcut(page, 'k')
  await expectNativeShortcut(page, 'f')
  await page.getByRole('button', { name: 'Active reference', exact: true }).click()

  const content = page.getByRole('textbox', { name: 'Note content', exact: true })

  await content.fill('Unsaved words')

  const url = page.url()

  await expectNativeShortcut(page, 'k')

  for (const binding of ['Meta+k', 'Control+k']) {
    await page.keyboard.press(binding)
    await expect(content).toBeFocused()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }

  await expect(page.getByText(/(?:Ctrl|⌘) \+ K/)).not.toBeVisible()
  await page.getByRole('link', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(search).toBeVisible()
  await search.fill('needle')
  await search.press('Enter')
  await expect(page.getByRole('button', { name: 'Active reference', exact: true })).toBeVisible()
})

for (const platform of ['Macintosh; Intel Mac OS X 10_15_7', 'X11; Linux x86_64']) {
  test(`desktop hint follows ${platform} and shortcuts survive navigation and remounting`, async ({ page, goto }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop')
    await page.addInitScript((platform) => {
      Object.defineProperty(navigator, 'userAgent', { value: `Mozilla/5.0 (${platform}) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36` })
    }, platform)
    await goto('/', { waitUntil: 'hydration' })

    const search = page.getByRole('searchbox', { name: 'Search notes', exact: true }).filter({ visible: true })

    await expect(page.getByText(platform.startsWith('Macintosh')
      ? '⌘ + K'
      : 'Ctrl + K', { exact: true })).toBeVisible()

    for (let visit = 0; visit < 3; visit++) {
      await page.getByRole('link', { name: 'Settings', exact: true }).filter({ visible: true }).click()
      await page.keyboard.press('Meta+k')
      await expect(search).toBeFocused()
      await page.getByRole('link', { name: 'All Notes', exact: true }).filter({ visible: true }).click()
      await page.keyboard.press('Control+k')
      await expect(search).toBeFocused()
    }

    await expectNativeShortcut(page, 'f')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(search).toHaveCSS('outline-style', 'solid')
    expect(Number.parseFloat(await search.evaluate(element => getComputedStyle(element).outlineWidth))).toBeGreaterThan(0)

    const session = await (await page.request.get('/api/session')).json()

    await page.getByRole('link', { name: 'Settings', exact: true }).filter({ visible: true }).click()
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.getByRole('textbox', { name: 'Email Address', exact: true }).focus()
    await expectNativeShortcut(page, 'k')
    await page.getByRole('textbox', { name: 'Email Address', exact: true }).fill(session.user.email)
    await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
    await page.getByRole('button', { name: 'Login', exact: true }).click()
    await expect(search).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(search).toBeFocused()
  })
}
