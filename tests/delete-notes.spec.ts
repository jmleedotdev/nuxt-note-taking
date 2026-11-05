import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

test('permanent delete confirms, cancels safely and updates selection and empty states', async ({ page, goto }, testInfo) => {
  if (testInfo.project.name === 'mobile')
    await page.setViewportSize({ width: 375, height: 812 })

  await page.emulateMedia({
    colorScheme: testInfo.project.name === 'tablet'
      ? 'dark'
      : 'light',
  })
  await goto('/login', { waitUntil: 'hydration' })

  const email = `delete-${randomUUID()}@example.test`
  const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': `198.18.7.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` }

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

  const first = await (await page.request.post('/api/notes', {
    headers,
    data: { title: 'Delete this note' },
  })).json()
  const remaining = await (await page.request.post('/api/notes', {
    headers,
    data: { title: 'Keep this note' },
  })).json()

  await goto(`/?note=${first.id}`, { waitUntil: 'hydration' })

  const trigger = page.getByRole('button', { name: 'Delete Note', exact: true }).filter({ visible: true })
  const modal = page.getByRole('dialog', { name: 'Delete Note', exact: true })

  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText('permanently')
  await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await (await page.request.get(`/api/notes/${first.id}`)).json()).toEqual(first)
  await trigger.click()
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(modal).toHaveCount(0)
  expect(await (await page.request.get(`/api/notes/${first.id}`)).json()).toEqual(first)

  await page.getByLabel('Title', { exact: true }).fill('Unsaved text')
  await trigger.click()
  await modal.getByRole('button', { name: 'Delete Note', exact: true }).click()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved text')
  expect(await (await page.request.get(`/api/notes/${first.id}`)).json()).toEqual(first)
  await trigger.click()
  await modal.getByRole('button', { name: 'Delete Note', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Delete this note', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Keep this note', exact: true })).toBeVisible()
  await expect(page.getByRole('button', {
    name: testInfo.project.name === 'desktop'
      ? 'Create New Note'
      : 'Keep this note',
    exact: true,
  }).filter({ visible: true })).toBeFocused()
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0)
  expect((await page.request.get(`/api/notes/${first.id}`)).status()).toBe(404)

  await page.getByRole('button', { name: 'Keep this note', exact: true }).click()
  await trigger.click()
  await modal.getByRole('button', { name: 'Delete Note', exact: true }).click()
  await expect(page.getByText('You don’t have any notes yet.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create New Note', exact: true })).toBeVisible()

  const archived = await (await page.request.post('/api/notes', {
    headers,
    data: { title: 'Archived deletion' },
  })).json()

  await page.request.post(`/api/notes/${archived.id}/archive`, {
    headers,
    data: { version: 1 },
  })
  await page.getByRole('link', { name: 'Archived Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Archived deletion', exact: true }).click()
  await trigger.click()
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(modal).toHaveCount(0)
  expect((await page.request.get(`/api/notes/${archived.id}`)).status()).toBe(200)
  await trigger.click()
  await expect(modal).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await modal.screenshot({
    path: testInfo.outputPath('delete-confirmation.png'),
    animations: 'disabled',
  })
  await modal.getByRole('button', { name: 'Delete Note', exact: true }).click()
  await expect(page).toHaveURL(/\?view=archived$/)
  await expect(page.getByText('No notes have been archived yet.', { exact: false })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Note list', exact: true })).toBeFocused()
  expect((await page.request.get(`/api/notes/${archived.id}`)).status()).toBe(404)
  expect((await page.request.get(`/api/notes/${remaining.id}`)).status()).toBe(404)

  // Failed and stale deletion must preserve the editor until an explicit reload.
  const conflict = await (await page.request.post('/api/notes', {
    headers,
    data: { title: 'Original conflict note' },
  })).json()

  await page.getByRole('link', { name: 'All Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Original conflict note', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Keep my draft')
  await page.route(`**/api/notes/${conflict.id}`, async (route) => {
    if (route.request().method() === 'DELETE')
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    else
      await route.continue()
  })
  await trigger.click()
  await modal.getByRole('button', { name: 'Delete Note', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not change this note')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep my draft')
  expect(await (await page.request.get(`/api/notes/${conflict.id}`)).json()).toEqual(conflict)
  await page.unroute(`**/api/notes/${conflict.id}`)
  await page.request.put(`/api/notes/${conflict.id}`, {
    headers,
    data: { title: 'Newer note', version: 1 },
  })
  await trigger.click()
  await modal.getByRole('button', { name: 'Delete Note', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByText('A newer version of this note exists.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep my draft')
  await page.getByRole('button', { name: 'Reload note', exact: true }).click()
  await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep my draft')
  await page.getByRole('button', { name: 'Reload note', exact: true }).click()
  await page.getByRole('button', { name: 'Discard note', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Newer note')
  await page.request.delete(`/api/notes/${conflict.id}`, {
    headers,
    data: { version: 2 },
  })
  await trigger.click()
  await modal.getByRole('button', { name: 'Delete Note', exact: true }).click()
  await expect(page.getByText('This note was removed.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reload note', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('You don’t have any notes yet.', { exact: false })).toBeVisible()
})
