import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

test('load failures are recoverable and unsaved navigation requires confirmation', async ({ page, goto }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await goto('/login', { waitUntil: 'hydration' })

  const email = `notes-navigation-${randomUUID()}@example.test`
  const clientIP = `198.18.1.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}`

  await page.context().setExtraHTTPHeaders({ 'x-real-ip': clientIP })

  const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': clientIP }

  await page.request.post('/api/registration', {
    headers,
    data: { email, password: 'Abcdef1!' },
  })

  const messages = await (await page.request.get('/__test/mail')).json() as { to: string, text: string }[]
  const link = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

  await page.request.get(link.pathname + link.search)

  await page.route('**/api/notes', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.getByLabel('Email Address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Abcdef1!')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not load your notes')
  await page.unroute('**/api/notes')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('You don’t have any notes yet.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Create New Note', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Keep this draft')

  await page.getByRole('link', { name: 'Archived Notes', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved note?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft')
  await page.screenshot({
    path: test.info().outputPath('new-note-dark.png'),
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Archived Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page).toHaveURL(/view=archived/)
  expect((await (await page.request.get('/api/notes')).json()).notes).toEqual([])
  await page.getByRole('link', { name: 'All Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Create New Note', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Title only')
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Title only')
  await expect(page).toHaveURL(/note=/)
  await page.getByRole('button', { name: 'Back to notes', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.route('**/api/notes/*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  // A refresh of the read is needed because Nuxt legitimately caches this saved note.
  await page.reload()
  await page.getByRole('button', { name: 'Title only', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not load this note')
  await page.unroute('**/api/notes/*')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Title only')
})
