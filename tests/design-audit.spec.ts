import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@nuxt/test-utils/playwright'

// Evidence capture, not a pixel-equality test. Opt in so normal regression runs
// do not rewrite the checked-in before-change baseline.
for (const theme of ['light', 'dark'] as const) {
  test(`design audit evidence (${theme})`, async ({ page, goto }, testInfo) => {
    test.skip(!process.env.DESIGN_AUDIT_OUTPUT, 'Set DESIGN_AUDIT_OUTPUT to capture an isolated visual baseline')
    test.setTimeout(120000)

    const project = testInfo.project.name
    const viewport = {
      desktop: { width: 1440, height: 900 },
      tablet: { width: 768, height: 1024 },
      mobile: { width: 375, height: 812 },
    }[project]!
    const directory = resolve(process.env.DESIGN_AUDIT_OUTPUT!, `${project}-${theme}`)
    const observations: unknown[] = []

    await mkdir(directory, { recursive: true })
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await goto('/login', { waitUntil: 'hydration' })

    async function capture(name: string) {
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('html')).toHaveClass(theme === 'dark'
        ? /dark/
        : /light/)
      await page.screenshot({
        path: resolve(directory, `${name}.png`),
        fullPage: true,
        animations: 'disabled',
      })
      observations.push({
        name,
        viewport: page.viewportSize(),
        ...await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          font: getComputedStyle(document.body).fontFamily,
          focus: document.activeElement?.outerHTML,
        })),
      })
    }

    async function visit(path: string) {
      await goto(path, { waitUntil: 'hydration' })
    }

    await capture('login')
    await page.getByLabel('Email Address', { exact: true }).focus()

    const loginOrder: string[] = []

    for (let index = 0; index < 6; index++) {
      loginOrder.push(await page.locator(':focus').evaluate(element => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName))
      await page.keyboard.press('Tab')
    }

    observations.push({ loginOrder })
    await capture('login-keyboard-focus')
    await visit('/signup')
    await capture('signup')
    await visit('/forgot-password')
    await capture('forgot-password')
    await visit('/reset-password?token=invalid')
    await capture('reset-invalid')
    await visit('/check-email?required=1')
    await capture('check-email')

    const email = `audit-${randomUUID()}@example.test`
    const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': `198.18.29.${{ desktop: 1, tablet: 2, mobile: 3 }[project]! + (theme === 'dark'
      ? 10
      : 0)}` }

    await page.setExtraHTTPHeaders({ 'x-real-ip': headers['x-real-ip'] })
    expect((await page.request.post('/api/registration', {
      headers,
      data: { email, password: 'Abcdef1!' },
    })).status()).toBe(202)

    const messages = await (await page.request.get('/__test/mail')).json() as { to: string, text: string }[]
    const verification = new URL(messages.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

    await page.request.get(verification.pathname + verification.search)
    expect((await page.request.post('/api/password/forgot', {
      headers,
      data: { email },
    })).status()).toBe(202)

    const recoveryMail = await (await page.request.get('/__test/mail')).json() as { to: string, subject: string, text: string }[]
    const recovery = recoveryMail.find(message => message.to === email && message.subject.includes('Reset'))

    expect(recovery).toBeDefined()

    const link = new URL(recovery!.text.match(/https?:\/\/\S+/)![0])

    await visit(link.pathname + link.search)
    await capture('reset-password')
    expect((await page.request.post('/api/login', {
      headers,
      data: { email, password: 'Abcdef1!' },
    })).status()).toBe(200)

    const note = await (await page.request.post('/api/notes', {
      headers,
      data: {
        title: 'Design audit reference',
        content: 'A private plain-text note.\n\nChanges are saved explicitly.\nKeep archive, deletion, and recovery capabilities.',
        tags: ['Work', 'Planning'],
      },
    })).json()

    await visit('/')
    await capture('note-list')
    await visit(`/?note=${note.id}`)
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Design audit reference')
    await capture('active-editor')
    await page.getByRole('button', { name: 'Delete Note', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await capture('delete-dialog')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Archive Note', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await capture('archive-dialog')
    await page.keyboard.press('Escape')
    await page.getByLabel('Title', { exact: true }).fill('Unsaved audit text')
    await page.getByRole('link', { name: 'All Notes', exact: true }).filter({ visible: true }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await capture('discard-dialog')
    await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Archive Note', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Archive Note', exact: true }).click()
    await expect(page.getByText('Note archived.', { exact: true })).toBeVisible()
    await capture('archive-toast')
    await visit('/?view=archived')
    await capture('archived-list')
    await visit(`/?view=archived&note=${note.id}`)
    await expect(page.getByLabel('Saved note content')).toBeVisible()
    await capture('archived-note')
    await visit('/?panel=settings')
    await capture('settings-navigation')

    for (const setting of ['color', 'font', 'password']) {
      await visit(`/?panel=settings&setting=${setting}`)
      await capture(`settings-${setting}`)
    }

    await visit(`/?note=${note.id}&view=archived`)
    await page.getByRole('button', { name: 'Restore Note', exact: true }).click()
    await visit(`/?note=${note.id}`)
    await page.getByLabel('Title', { exact: true }).fill('Retained conflicting draft')
    expect((await page.request.put(`/api/notes/${note.id}`, {
      headers,
      data: { title: 'Newer saved title', version: 3 },
    })).status()).toBe(200)
    await page.getByRole('button', { name: 'Save Note', exact: true }).click()
    await expect(page.getByText('A newer version of this note exists.', { exact: true })).toBeVisible()
    await capture('conflict-recovery')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await visit('/?draft=1')
    await capture('new-editor')
    // Existing project widths are useful boundary checks as well as reference sizes.
    await page.setViewportSize(testInfo.project.use.viewport!)
    await capture('project-width-new-editor')
    await writeFile(resolve(directory, 'observations.json'), `${JSON.stringify(observations, null, 2)}\n`)
  })
}
