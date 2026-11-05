import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'
import { expectKeyboardOrder } from './helpers/keyboard'

for (const theme of ['light', 'dark'] as const) {
  test(`responsive note navigation and action placement (${theme})`, async ({ page, goto }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop'
    const viewport = {
      desktop: { width: 1440, height: 900 },
      tablet: { width: 768, height: 1024 },
      mobile: { width: 375, height: 812 },
    }[testInfo.project.name]!

    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme: theme })
    await goto('/login', { waitUntil: 'hydration' })

    const email = `responsive-${randomUUID()}@example.test`
    const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': `198.18.32.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]! + (theme === 'dark'
      ? 10
      : 0)}` }

    expect((await page.request.post('/api/registration', {
      headers,
      data: { email, password: 'Abcdef1!' },
    })).status()).toBe(202)

    const mail = await (await page.request.get('/__test/mail')).json() as { to: string, text: string }[]
    const link = new URL(mail.find(message => message.to === email)!.text.match(/https?:\/\/\S+/)![0])

    await page.request.get(link.pathname + link.search)
    expect((await page.request.post('/api/login', {
      headers,
      data: { email, password: 'Abcdef1!' },
    })).status()).toBe(200)

    const note = await (await page.request.post('/api/notes', {
      headers,
      data: { title: 'Responsive saved note', content: 'Saved body' },
    })).json()

    await goto(`/?note=${note.id}`, { waitUntil: 'hydration' })
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Responsive saved note')

    const back = page.getByRole('button', { name: 'Back to notes', exact: true })
    const remove = page.getByRole('button', { name: 'Delete Note', exact: true }).filter({ visible: true })
    const archive = page.getByRole('button', { name: 'Archive Note', exact: true }).filter({ visible: true })
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true }).filter({ visible: true })
    const save = page.getByRole('button', { name: 'Save Note', exact: true }).filter({ visible: true })

    await expect(back).toBeVisible({ visible: !desktop })
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toHaveCount(0)
    await expect(remove).toHaveCount(1)
    await expect(archive).toHaveCount(1)

    if (desktop) {
      await expect(page.getByText(email, { exact: true })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Note list', exact: true })).toBeVisible()
      await expectKeyboardOrder(page, [
        page.getByRole('link', { name: 'All Notes', exact: true }),
        page.getByRole('link', { name: 'Archived Notes', exact: true }),
        page.getByRole('searchbox', { name: 'Search notes' }),
        page.getByRole('link', { name: 'Settings', exact: true }),
        page.getByRole('button', { name: 'Create New Note', exact: true }),
        page.getByRole('button', { name: 'Responsive saved note', exact: true }),
      ])
      await page.getByLabel('Title', { exact: true }).focus()
      await page.keyboard.press('Tab')
      await expect(page.getByLabel('Tags', { exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.getByLabel('Note content', { exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(save).toBeFocused()
      await expectKeyboardOrder(page, [save, cancel, archive, remove])
    } else {
      await expectKeyboardOrder(page, [back, remove, archive, cancel, save])
      await save.focus()
      await page.keyboard.press('Tab')
      await expect(page.getByLabel('Title', { exact: true })).toBeFocused()

      const row = await back.boundingBox()

      for (const action of [remove, archive, cancel, save]) {
        const box = await action.boundingBox()

        expect(Math.abs(box!.y - row!.y)).toBeLessThan(5)
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
      }
    }

    if (!desktop) {
      const toolbar = page.getByRole('toolbar', { name: 'Note toolbar' })

      await expect(toolbar.getByRole('button', { name: 'Delete Note', exact: true })).toBeVisible()
      await expect(toolbar.getByRole('button', { name: 'Archive Note', exact: true })).toBeVisible()

      for (const width of [320, 375, 549, 768, 1099, 1279]) {
        await page.setViewportSize({ width, height: viewport.height })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

        for (const action of [back, remove, archive, cancel, save]) {
          const box = await action.boundingBox()

          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        }
      }

      await page.setViewportSize(viewport)
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`responsive-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByLabel('Note content', { exact: true }).focus()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Unsaved second line')
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Saved body\nUnsaved second line')
    await remove.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Delete Note', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(remove).toBeFocused()
    await archive.click()
    await page.getByRole('dialog', { name: 'Archive Note', exact: true }).getByRole('button', { name: 'Archive Note', exact: true }).click()
    await page.getByRole('button', { name: 'Keep writing', exact: true }).click()
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Saved body\nUnsaved second line')
    await cancel.click()
    await page.reload()
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Saved body')
    await archive.click()
    await page.getByRole('dialog', { name: 'Archive Note', exact: true }).getByRole('button', { name: 'Archive Note', exact: true }).click()
    await expect(page).not.toHaveURL(/note=/)
    await page.getByRole('link', { name: 'Archived Notes', exact: true }).click()
    await page.getByRole('button', { name: 'Responsive saved note', exact: true }).click()
    await expect(page.getByLabel('Saved note content')).toHaveText('Saved body')
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(back).toBeVisible({ visible: !desktop })

    const restore = page.getByRole('button', { name: 'Restore Note', exact: true }).filter({ visible: true })

    await expect(restore).toHaveCount(1)
    await expect(remove).toHaveCount(1)

    if (!desktop) {
      const toolbar = page.getByRole('toolbar', { name: 'Archived note toolbar' })

      await expect(toolbar.getByRole('button', { name: 'Restore Note', exact: true })).toBeVisible()
      await expect(toolbar.getByRole('button', { name: 'Delete Note', exact: true })).toBeVisible()
      await page.keyboard.press('Tab')
      await expectKeyboardOrder(page, [back, remove, restore])

      for (const width of [320, 375, 549, 768, 1099, 1279]) {
        await page.setViewportSize({ width, height: viewport.height })

        const row = await back.boundingBox()

        for (const action of [remove, restore]) {
          const box = await action.boundingBox()

          expect(Math.abs(box!.y - row!.y)).toBeLessThan(5)
          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }

      await page.setViewportSize(viewport)
    }

    await page.screenshot({
      path: testInfo.outputPath(`archived-responsive-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await remove.click()
    await page.keyboard.press('Escape')
    await expect(remove).toBeFocused()
    await expect(page.getByLabel('Saved note content')).toHaveText('Saved body')
    await remove.click()
    await page.getByRole('dialog', { name: 'Delete Note', exact: true }).getByRole('button', { name: 'Delete Note', exact: true }).click()
    await expect(page.getByText('No notes have been archived yet.', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('No notes have been archived yet.', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'All Notes', exact: true }).click()
    await page.getByRole('button', { name: 'Create New Note', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Archive Note', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete Note', exact: true })).toHaveCount(0)
    await expect(back).toBeVisible({ visible: !desktop })
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page).not.toHaveURL(/draft=/)
  })
}
