import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

async function signIn(page: import('@playwright/test').Page, clientIP: string) {
  const email = `browser-notes-${randomUUID()}@example.test`
  const origin = new URL(page.url()).origin
  const headers = { origin, 'x-real-ip': clientIP }

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
}

test('create, cancel, save, refresh and reopen preserve private paragraphs and tags', async ({ page, goto }, testInfo) => {
  await goto('/login', { waitUntil: 'hydration' })
  await signIn(page, `198.18.0.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}`)
  await expect(page.getByText('You don’t have any notes yet.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Create New Note', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Abandoned note')

  if (testInfo.project.name !== 'desktop') {
    await page.getByRole('button', { name: 'Back to notes', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Discard unsaved note?' })).toBeVisible()
    await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Abandoned note')
  }

  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await (await page.request.get('/api/notes')).json()).notes).toEqual([])

  await page.getByRole('button', { name: 'Create New Note', exact: true }).click()
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible()
  await page.getByLabel('Title', { exact: true }).fill('My paragraphs')
  await page.getByLabel('Tags', { exact: true }).fill('x'.repeat(51))
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByText('Use at most 50 characters per tag.', { exact: true })).toBeVisible()
  await page.getByLabel('Tags', { exact: true }).fill(' Work, work, Planning, PLANNING ')

  const content = '  First paragraph\n\nSecond paragraph\n  <script>window.noteInjected = true</script>  \n'

  await page.getByLabel('Note content', { exact: true }).fill(content)

  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"NOTES_UNAVAILABLE"}}' })
    else
      await route.continue()
  })
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not save')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My paragraphs')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue(content)
  await page.unroute('**/api/notes')
  await page.getByRole('button', { name: 'Save Note', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My paragraphs')
  await expect.poll(async () => (await (await page.request.get('/api/notes')).json()).notes.length).toBe(1)
  await expect(page).toHaveURL(/note=/)
  await page.reload()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My paragraphs')
  await expect(page.getByLabel('Note content', { exact: true })).toHaveValue(content)
  expect(await page.evaluate(() => 'noteInjected' in window)).toBe(false)
  await expect(page.getByLabel('Tags', { exact: true })).toHaveValue('Work, Planning')
  await expect(page.getByText('Last edited', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('saved-note.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Back to notes', exact: true }).click()
  await page.getByRole('button', { name: 'My paragraphs', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My paragraphs')
})
