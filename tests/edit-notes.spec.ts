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
  await page.keyboard.press('Control+s')
  await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible()
  await page.getByLabel('Title', { exact: true }).fill('Edited title')
  await page.getByLabel('Tags', { exact: true }).fill('Planning, planning, Personal')
  await page.getByLabel('Note content', { exact: true }).fill('Edited body\n\n<script>window.editInjected = true</script>')
  await page.route(`**/api/notes/${note.id}`, route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"NOTES_UNAVAILABLE"}}' })
    : route.continue())
  await page.keyboard.press('Meta+s')
  await expect(page.getByRole('alert')).toContainText('could not save')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Edited title')
  await expect(page.getByLabel('Tags', { exact: true })).toHaveValue('Planning, planning, Personal')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Edited body\n\n<script>window.editInjected = true</script>')
  await page.unroute(`**/api/notes/${note.id}`)
  await page.route(`**/api/notes/${note.id}`, route => route.abort('failed'))
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('alert')).toContainText('could not save')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Edited title')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Edited body\n\n<script>window.editInjected = true</script>')
  await page.unroute(`**/api/notes/${note.id}`)
  await page.keyboard.press('Meta+s')
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

  await page.getByRole('link', { name: 'Settings', exact: true }).click()
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
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({
    animations: 'disabled',
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
  await page.keyboard.press('Meta+s')
  await expect(page.getByText('A newer version of this note exists.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My rejected title')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Copy this text before reloading')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const warningToast = page.getByRole('listitem').filter({ hasText: 'A newer version of this note exists.' })
  const reloadAction = warningToast.getByRole('button', { name: 'Reload note', exact: true })

  await expect(warningToast.locator('[data-slot="icon"]')).toBeVisible()
  // Recovery must outlive the library's normal five-second success lifetime.
  await page.waitForTimeout(5500)
  await expect(warningToast).toBeVisible()
  await reloadAction.focus()
  await expect(reloadAction).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(warningToast.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(reloadAction).toBeFocused()

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await expect(page.locator('html')).toHaveClass(new RegExp(theme))
    await expect(reloadAction).toHaveCSS('color', 'rgb(14, 18, 27)')
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`edit-conflict-${theme}.png`),
      fullPage: true,
    })
  }

  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My rejected title')
  await page.route(`**/api/notes/${note.id}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.getByRole('button', { name: 'Reload note', exact: true }).first().click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'could not reload' })).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My rejected title')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Copy this text before reloading')
  await page.unroute(`**/api/notes/${note.id}`)
  expect((await (await page.request.get(`/api/notes/${note.id}`)).json()).title).toBe('Newer version from another tab')
  // Closing a warning is not permission to discard; the editor keeps its fallback.
  await page.getByLabel('Tags', { exact: true }).focus()
  await page.keyboard.press('Control+s')
  await expect(warningToast).toBeVisible()
  await warningToast.getByRole('button', { name: 'Close', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(warningToast).toHaveCount(0)
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Copy this text before reloading')
  await page.getByRole('button', { name: 'Reload note', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Newer version from another tab')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Saved body')

  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  await page.getByLabel('Note content', { exact: true }).fill('Text for the removed note')
  await page.request.post('/__test/note-state', {
    data: { id: note.id, remove: true },
  })
  await page.keyboard.press('Control+s')
  await expect(page.getByText('This note was removed.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Text for the removed note')

  const removedToast = page.getByRole('listitem').filter({ hasText: 'This note was removed.' })

  await expect(removedToast).toBeVisible()
  await removedToast.getByRole('button', { name: 'Reload note', exact: true }).click()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Text for the removed note')
  expect((await page.request.get(`/api/notes/${note.id}`)).status()).toBe(404)
  await page.getByRole('button', { name: 'Reload note', exact: true }).first().click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('You don’t have any notes yet.', { exact: false })).toBeVisible()
  await otherTab.close()
})

test('a successful new-note save opens the saved editor before a slow list refresh finishes', async ({ page, goto }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })
  await signInAndCreate(page, testInfo.project.name)
  await goto('/?draft=1', { waitUntil: 'hydration' })
  await page.getByLabel('Title', { exact: true }).fill('Saved despite a slow list')

  let releaseList!: () => void

  const listReady = new Promise<void>((resolve) => {
    releaseList = resolve
  })

  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'GET')
      await listReady
    await route.continue()
  })

  try {
    await page.getByLabel('Note content', { exact: true }).fill('First line')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Second line')
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('First line\nSecond line')
    expect((await (await page.request.get('/api/notes')).json()).notes).toHaveLength(1)
    await page.keyboard.press('Control+s')
    await expect(page).toHaveURL(/note=/)

    const saved = await (await page.request.get(`/api/notes/${new URL(page.url()).searchParams.get('note')}`)).json()

    expect(saved.content).toBe('First line\nSecond line')
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Saved despite a slow list')
  } finally {
    releaseList()
    await page.unrouteAll({ behavior: 'wait' })
  }
})

for (const modifier of ['Control', 'Meta']) {
  test(`${modifier}+S saves new and existing notes once despite pending and held keys`, async ({ page, goto }, testInfo) => {
    await page.addInitScript((mac) => {
      Object.defineProperty(navigator, 'userAgent', {
        value: mac ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' : 'Mozilla/5.0 (Windows NT 10.0)',
      })
    }, modifier === 'Meta')
    await goto('/login', { waitUntil: 'hydration' })
    await signInAndCreate(page, testInfo.project.name)
    await goto('/?draft=1', { waitUntil: 'hydration' })
    await page.getByLabel('Note content', { exact: true }).fill('Keep the new draft\n\nSecond paragraph')
    await page.keyboard.press(`${modifier}+s`)
    await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible()
    await page.getByLabel('Title', { exact: true }).fill(`${modifier} saved note`)
    await page.route('**/api/notes', route => route.request().method() === 'POST'
      ? modifier === 'Control'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        : route.abort('failed')
      : route.continue())
    await page.keyboard.press(`${modifier}+s`)
    await expect(page.getByRole('alert')).toContainText('could not save')
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(`${modifier} saved note`)
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Keep the new draft\n\nSecond paragraph')
    expect((await (await page.request.get('/api/notes')).json()).notes).toHaveLength(1)
    await page.unroute('**/api/notes')

    const saveButton = page.getByRole('button', { name: 'Save Note', exact: true }).filter({ visible: true })

    await expect(saveButton).toBeVisible()
    await expect(saveButton).toContainText(modifier === 'Meta'
      ? '⌘ + S'
      : 'Ctrl + S')

    for (const method of ['POST', 'PUT']) {
      const path = method === 'POST'
        ? '/api/notes'
        : `/api/notes/${new URL(page.url()).searchParams.get('note')}`

      let requests = 0

      let release!: () => void

      const ready = new Promise<void>((resolve) => {
        release = resolve
      })

      await page.route(`**${path}`, async (route) => {
        if (route.request().method() === method) {
          requests++
          await ready
        }

        await route.continue()
      })
      await page.getByLabel('Tags', { exact: true }).fill(method === 'POST'
        ? 'First'
        : 'Updated')

      try {
        await page.keyboard.down(modifier)
        await page.keyboard.down('s')
        await expect.poll(() => requests).toBe(1)
        await page.keyboard.down('s')
        await page.keyboard.press('s')
        expect(requests).toBe(1)
        await page.keyboard.up(modifier)
        // Keep S held across the successful save's editor replacement.
        await page.keyboard.down(modifier)
        await page.keyboard.down('s')
        release()
        await expect(page).toHaveURL(/note=/)
        await expect(page.getByLabel('Tags', { exact: true })).toBeEnabled()
        await page.keyboard.down('s')
        await page.keyboard.up('s')
        await page.keyboard.up(modifier)
        expect(requests).toBe(1)

        const id = new URL(page.url()).searchParams.get('note')
        const saved = await (await page.request.get(`/api/notes/${id}`)).json() as Note

        expect(saved.tags).toEqual([
          method === 'POST'
            ? 'First'
            : 'Updated',
        ])
        expect(saved.version).toBe(method === 'POST'
          ? 1
          : 2)
        expect((await (await page.request.get('/api/notes')).json()).notes).toHaveLength(2)

        // A fresh no-op save preserves the version and last-edited timestamp.
        const response = page.waitForResponse(r => r.url().endsWith(`/api/notes/${id}`) && r.request().method() === 'PUT')

        await page.keyboard.press(`${modifier}+s`)
        await response
        await expect(page.getByLabel('Tags', { exact: true })).toBeEnabled()
        expect(await (await page.request.get(`/api/notes/${id}`)).json()).toEqual(saved)
      } finally {
        release()
        await page.keyboard.up('s')
        await page.keyboard.up(modifier)
        await page.unrouteAll({ behavior: 'wait' })
      }
    }
  })
}

// Check cancellation of the DOM default as well as real keys and persisted data.
// Headless Chromium doesn't display the native Save Page chooser.
async function expectNativeSave(page: Page) {
  for (const modifier of ['Control', 'Meta']) {
    await page.keyboard.press(`${modifier}+s`)

    const prevented = await page.evaluate((key) => {
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: key === 'Control',
        metaKey: key === 'Meta',
        bubbles: true,
        cancelable: true,
      })

      document.activeElement!.dispatchEvent(event)

      return event.defaultPrevented
    }, modifier)

    expect(prevented).toBe(false)
  }
}

test('save shortcuts leave native actions alone outside an editor and in every confirmation', async ({ page, goto }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })
  await page.getByLabel('Email Address', { exact: true }).fill('not-submitted@example.test')
  await expectNativeSave(page)
  await expect(page).toHaveURL(/login/)

  const note = await signInAndCreate(page, testInfo.project.name)

  await goto('/', { waitUntil: 'hydration' })

  let mutations = 0

  page.on('request', (request) => {
    if (/\/api\/(?:notes|preferences|password)/.test(request.url()) && ['POST', 'PUT', 'DELETE'].includes(request.method()))
      mutations++
  })
  await expectNativeSave(page)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/panel=settings/)
  await expectNativeSave(page)
  await page.getByRole('link', { name: 'Change Password', exact: true }).filter({ visible: true }).click()
  await page.getByLabel('Old Password', { exact: true }).fill('not-submitted')
  await expectNativeSave(page)
  await expect(page.getByLabel('Old Password', { exact: true })).toHaveValue('not-submitted')

  await goto(`/?note=${note.id}`, { waitUntil: 'hydration' })
  await page.getByLabel('Note content', { exact: true }).fill('Keep this unsaved text')

  for (const action of ['Archive Note', 'Delete Note', 'Discard unsaved note?']) {
    if (action === 'Discard unsaved note?')
      await page.getByRole('link', { name: 'Settings', exact: true }).click()
    else
      await page.getByRole('button', { name: action, exact: true }).click()

    const dialog = page.getByRole('dialog', { name: action, exact: true })

    await expect(dialog).toBeVisible()

    const focused = dialog.getByRole('button', {
      name: action === 'Discard unsaved note?'
        ? 'Keep writing'
        : 'Cancel',
      exact: true,
    })

    await expect(focused).toBeFocused()
    await expectNativeSave(page)
    await expect(focused).toBeFocused()
    expect(await (await page.request.get(`/api/notes/${note.id}`)).json()).toEqual(note)
    await page.keyboard.press('Escape')
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Keep this unsaved text')
  }

  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(mutations).toBe(0)
  await page.request.post(`/api/notes/${note.id}/archive`, {
    headers: { origin: new URL(page.url()).origin },
    data: { version: note.version },
  })
  await goto(`/?view=archived&note=${note.id}`, { waitUntil: 'hydration' })
  await expect(page.getByRole('heading', { name: note.title, exact: true })).toBeVisible()
  await expectNativeSave(page)
  expect((await (await page.request.get(`/api/notes/${note.id}`)).json()).isArchived).toBe(true)
  expect(mutations).toBe(0)
})
