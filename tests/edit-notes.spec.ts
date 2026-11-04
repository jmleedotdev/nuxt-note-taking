import type { Page } from '@playwright/test'
import type { Note } from '../shared/types/note'
import { randomUUID } from 'node:crypto'
import { waitForHydration } from '@nuxt/test-utils/e2e'
import { expect, test } from '@nuxt/test-utils/playwright'

async function signInAndCreate(page: Page, project: string): Promise<Note> {
  const email = `edit-${randomUUID()}@example.test`
  const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': `198.18.5.${{ desktop: 1, tablet: 2, mobile: 3 }[project]}` }

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

  return (await page.request.post('/api/notes', {
    headers,
    data: {
      title: 'Saved title',
      content: 'Saved body',
      tags: ['Work'],
    },
  })).json()
}

test('explicit Save and Cancel retain drafts on failures and guard navigation', async ({ page, goto }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })

  const note = await signInAndCreate(page, testInfo.project.name)

  await page.request.post('/api/notes', {
    headers: { origin: new URL(page.url()).origin },
    data: { title: 'Another saved note' },
  })
  await goto(`/?note=${note.id}`, { waitUntil: 'hydration' })
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Saved title')
  await page.getByLabel('Title', { exact: true }).fill('Unsaved title')
  await page.getByLabel('Tags', { exact: true }).fill('Planning, planning, Personal')
  await page.getByLabel('Note content', { exact: true }).fill('Unsaved body\n\n<b>plain text</b>')
  expect(await (await page.request.get(`/api/notes/${note.id}`)).json()).toEqual(note)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Saved title')
  await expect(page.getByLabel('Tags', { exact: true })).toHaveValue('Work')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Saved body')

  await page.getByLabel('Title', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible()
  await page.getByLabel('Title', { exact: true }).fill('Edited title')
  await page.getByLabel('Tags', { exact: true }).fill('Planning, planning, Personal')
  await page.getByLabel('Note content', { exact: true }).fill('Edited body\n\n<script>window.editInjected = true</script>')
  await page.route(`**/api/notes/${note.id}`, route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"NOTES_UNAVAILABLE"}}' })
    : route.continue())
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not save')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Edited title')
  await expect(page.getByLabel('Tags', { exact: true })).toHaveValue('Planning, planning, Personal')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Edited body\n\n<script>window.editInjected = true</script>')
  await page.unroute(`**/api/notes/${note.id}`)
  await page.route(`**/api/notes/${note.id}`, route => route.abort('failed'))
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not save')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Edited title')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Edited body\n\n<script>window.editInjected = true</script>')
  await page.unroute(`**/api/notes/${note.id}`)
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByLabel('Tags', { exact: true })).toHaveValue('Planning, Personal')
  await page.reload()
  await waitForHydration(page, page.url(), 'hydration')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Edited title')
  expect(await page.evaluate(() => 'editInjected' in window)).toBe(false)

  await page.getByLabel('Title', { exact: true }).fill('Keep this draft')

  if (testInfo.project.name === 'desktop')
    await page.getByRole('button', { name: 'Another saved note', exact: true }).click()
  else
    await page.getByRole('button', { name: 'Back to notes', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved note?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft')
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved note?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft')
  await page.getByRole('link', { name: 'Archived Notes', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved note?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft')

  const dialog = page.waitForEvent('dialog')

  await page.reload({ timeout: 2000 }).catch(() => {})

  const warning = await dialog

  expect(warning.type()).toBe('beforeunload')
  await warning.dismiss()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft')
  expect(await page.evaluate(() => [
    ...Object.values(localStorage),
    ...Object.values(sessionStorage),
  ].some(value => value.includes('Keep this draft')))).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath('edit-note.png'),
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Archived Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page).toHaveURL(/view=archived/)
})

test('competing tabs keep rejected text and reload the latest or removed note with toast guidance', async ({ page, goto }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await goto('/login', { waitUntil: 'hydration' })

  const note = await signInAndCreate(page, testInfo.project.name)
  const path = `/?note=${note.id}`

  await goto(path, { waitUntil: 'hydration' })

  const otherTab = await page.context().newPage()

  await otherTab.goto(new URL(path, page.url()).href)
  await waitForHydration(otherTab, path, 'hydration')
  await otherTab.getByLabel('Title', { exact: true }).fill('Newer version from another tab')
  await otherTab.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect.poll(async () => (await (await page.request.get(`/api/notes/${note.id}`)).json()).version).toBe(2)
  await page.getByLabel('Title', { exact: true }).fill('My rejected title')
  await page.getByLabel('Note content', { exact: true }).fill('Copy this text before reloading')
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByText('A newer version of this note exists.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My rejected title')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Copy this text before reloading')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('edit-conflict-dark.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Reload note', exact: true }).first().click()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My rejected title')
  await page.route(`**/api/notes/${note.id}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.getByRole('button', { name: 'Reload note', exact: true }).first().click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'could not reload' })).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My rejected title')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Copy this text before reloading')
  await page.unroute(`**/api/notes/${note.id}`)
  await page.getByRole('button', { name: 'Reload note', exact: true }).first().click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Newer version from another tab')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Saved body')

  await page.getByLabel('Note content', { exact: true }).fill('Text for the removed note')
  await page.request.post('/__test/note-state', {
    data: { id: note.id, remove: true },
  })
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByText('This note was removed.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Text for the removed note')
  await page.getByRole('button', { name: 'Reload note', exact: true }).first().click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('You don’t have any notes yet.', { exact: false })).toBeVisible()
  await otherTab.close()
})
