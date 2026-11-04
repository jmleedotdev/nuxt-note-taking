import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

test('archive confirmation protects unsaved work and archived notes can be read and restored', async ({ page, goto }, testInfo) => {
  await page.emulateMedia({
    colorScheme: testInfo.project.name === 'tablet'
      ? 'dark'
      : 'light',
  })
  await goto('/login', { waitUntil: 'hydration' })

  const email = `archive-${randomUUID()}@example.test`
  const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': `198.18.6.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` }

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

  const note = await (await page.request.post('/api/notes', {
    headers,
    data: {
      title: 'Reference note',
      content: 'Saved reference\n\n<b>plain text</b>',
      tags: ['Work'],
    },
  })).json()

  await goto(`/?note=${note.id}`, { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Archive Note', exact: true }).click()

  const modal = page.getByRole('dialog', { name: 'Archive Note', exact: true })

  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(modal).toHaveCount(0)
  expect(await (await page.request.get(`/api/notes/${note.id}`)).json()).toEqual(note)
  await page.getByLabel('Title', { exact: true }).fill('Unsaved reference')
  await page.getByRole('button', { name: 'Archive Note', exact: true }).click()
  await modal.getByRole('button', { name: 'Archive Note', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved note?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved reference')
  expect(await (await page.request.get(`/api/notes/${note.id}`)).json()).toEqual(note)
  await page.getByRole('button', { name: 'Archive Note', exact: true }).click()
  await modal.getByRole('button', { name: 'Archive Note', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Reference note', exact: true })).toHaveCount(0)
  await page.route('**/api/notes?archived=true', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.getByRole('link', { name: 'Archived Notes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not load your notes')
  await page.unroute('**/api/notes?archived=true')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await page.getByRole('button', { name: 'Reference note', exact: true }).click()
  await expect(page.getByLabel('Saved note content')).toHaveText('Saved reference\n\n<b>plain text</b>')
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save Note', exact: true })).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('archived-note.png'),
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Restore Note', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('No notes have been archived yet.', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'All Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Reference note', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Reference note')
  expect(await (await page.request.get(`/api/notes/${note.id}`)).json()).toEqual({ ...note, version: 3 })

  // An archive attempt must not act on a newer save, or discard a failed draft.
  await page.request.put(`/api/notes/${note.id}`, {
    headers,
    data: { title: 'Newer reference', version: 3 },
  })
  await page.getByLabel('Title', { exact: true }).fill('Keep rejected draft')
  await page.getByRole('button', { name: 'Archive Note', exact: true }).click()
  await modal.getByRole('button', { name: 'Archive Note', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByText('A newer version of this note exists.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep rejected draft')
  await page.getByRole('button', { name: 'Reload note', exact: true }).click()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep rejected draft')
  await page.getByRole('button', { name: 'Reload note', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Newer reference')

  await page.getByRole('button', { name: 'Archive Note', exact: true }).click()
  await modal.getByRole('button', { name: 'Archive Note', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: 'Archived Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Newer reference', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Restore Note', exact: true })).toBeVisible()
  await page.request.post(`/api/notes/${note.id}/restore`, {
    headers,
    data: { version: 5 },
  })
  await page.getByRole('button', { name: 'Restore Note', exact: true }).click()
  await expect(page.getByText('A newer version of this note exists.', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.request.post('/__test/note-state', {
    data: { id: note.id, remove: true },
  })
  await page.getByRole('button', { name: 'Restore Note', exact: true }).click()

  const removedToast = page.getByRole('listitem').filter({ hasText: 'This note was removed.' })

  await expect(removedToast).toBeVisible()
  await removedToast.getByRole('button', { name: 'Reload note', exact: true }).click()
  await expect(page.getByText('No notes have been archived yet.', { exact: false })).toBeVisible()
})
