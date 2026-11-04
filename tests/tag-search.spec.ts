import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

test('saved tag navigation and scoped search clear filters across responsive journeys', async ({ page, goto }, testInfo) => {
  await page.emulateMedia({
    colorScheme: testInfo.project.name === 'tablet'
      ? 'dark'
      : 'light',
  })
  await goto('/login', { waitUntil: 'hydration' })

  const email = `search-${randomUUID()}@example.test`
  const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': `198.18.20.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` }

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

  const active = await (await page.request.post('/api/notes', {
    headers,
    data: {
      title: 'Active reference',
      content: 'Saved needle',
      tags: ['Work'],
    },
  })).json()
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
  await goto('/', { waitUntil: 'hydration' })

  const desktop = testInfo.project.name === 'desktop'
  const search = page.getByRole('searchbox', { name: 'Search notes', exact: true }).filter({ visible: true })
  const openSearch = async () => {
    if (!desktop)
      await page.getByRole('link', { name: 'Search', exact: true }).click()
  }
  const openTags = async () => {
    if (!desktop)
      await page.getByRole('link', { name: 'Browse tags', exact: true }).click()
  }

  await openSearch()
  await expect(search).toHaveValue('')
  await search.fill('NEEDLE')
  await search.press('Enter')
  await expect(page.getByRole('button', { name: 'Active reference', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archived reference', exact: true })).toHaveCount(0)
  await openTags()
  await page.getByRole('link', { name: 'Tag: Archive only', exact: true }).filter({ visible: true }).click()
  await expect(page.getByText('No active notes have this tag.', { exact: true })).toBeVisible()
  await openSearch()
  await expect(search).toHaveValue('')
  await search.fill('no-match')
  await search.press('Enter')
  await expect(page.getByText('No notes match your search.', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Archived Notes', exact: true }).filter({ visible: true }).click()
  await openSearch()
  await expect(search).toHaveValue('')
  await search.fill('needle')
  await search.press('Enter')
  await expect(page.getByRole('button', { name: 'Archived reference', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Active reference', exact: true })).toHaveCount(0)
  await openTags()
  await page.getByRole('link', { name: 'Tag: Work', exact: true }).filter({ visible: true }).click()
  await expect(page.getByRole('button', { name: 'Active reference', exact: true })).toBeVisible()

  if (desktop) {
    await search.fill('Unsubmitted query')
    await page.getByRole('link', { name: 'Tag: Work', exact: true }).filter({ visible: true }).click()
    await expect(search).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Active reference', exact: true })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Active reference', exact: true }).click()
  await page.getByLabel('Tags', { exact: true }).fill('Unsaved')

  if (desktop)
    await page.getByRole('link', { name: 'Tag: Work', exact: true }).filter({ visible: true }).click()
  else
    await openTags()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Tags', { exact: true })).toHaveValue('Unsaved')
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await openTags()
  await expect(page.getByRole('link', { name: 'Tag: Unsaved', exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tag: Work', exact: true })).toHaveCount(0)
  expect((await (await page.request.get(`/api/notes/${active.id}`)).json()).tags).toEqual(['Unsaved'])
  await page.screenshot({
    path: testInfo.outputPath('tags.png'),
    fullPage: true,
  })

  await openSearch()

  let releaseSearch!: () => void

  const delayedSearch = new Promise<void>((resolve) => {
    releaseSearch = resolve
  })

  await page.route('**/api/notes?q=waiting', async (route) => {
    await delayedSearch
    await route.fulfill({
      json: { notes: [] },
    })
  })
  await search.fill('waiting')
  await search.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Loading notes…' })).toBeVisible()
  releaseSearch()
  await expect(page.getByText('No notes match your search.', { exact: false })).toBeVisible()
  await page.unroute('**/api/notes?q=waiting')
  await page.route('**/api/notes?q=broken', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await search.fill('broken')
  await search.press('Enter')
  await expect(page.getByRole('alert')).toContainText('We could not load your notes.')
  await page.unroute('**/api/notes?q=broken')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('No notes match your search.', { exact: false })).toBeVisible()
  await search.fill('Saved needle')
  await search.press('Enter')
  await page.getByRole('button', { name: 'Active reference', exact: true }).click()
  await page.getByRole('button', { name: 'Archive Note', exact: true }).click()
  await page.getByRole('dialog', { name: 'Archive Note', exact: true }).getByRole('button', { name: 'Archive Note', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Active reference', exact: true })).toHaveCount(0)
  await openTags()
  await page.getByRole('link', { name: 'Tag: Unsaved', exact: true }).filter({ visible: true }).click()
  await expect(page.getByText('No active notes have this tag.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Archived Notes', exact: true }).filter({ visible: true }).click()
  await page.getByRole('button', { name: 'Active reference', exact: true }).click()
  await page.getByRole('button', { name: 'Restore Note', exact: true }).click()
  await openTags()
  await page.getByRole('link', { name: 'Tag: Unsaved', exact: true }).filter({ visible: true }).click()
  await page.getByRole('button', { name: 'Active reference', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Note', exact: true }).click()
  await page.getByRole('dialog', { name: 'Delete Note', exact: true }).getByRole('button', { name: 'Delete Note', exact: true }).click()
  await openTags()
  await expect(page.getByRole('link', { name: 'Tag: Unsaved', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
