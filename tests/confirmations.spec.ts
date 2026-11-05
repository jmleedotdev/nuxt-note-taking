import { randomUUID } from 'node:crypto'
import { expect, test } from '@nuxt/test-utils/playwright'

for (const action of ['Archive Note', 'Delete Note']) {
  test(`${action} confirmation keeps focus safe and returns it after cancellation or removal`, async ({ page, goto }, testInfo) => {
    await goto('/login', { waitUntil: 'hydration' })

    const email = `confirmation-${randomUUID()}@example.test`
    const headers = { 'origin': new URL(page.url()).origin, 'x-real-ip': `198.18.31.${{ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]}` }

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

    const note = await (await page.request.post('/api/notes', {
      headers,
      data: { title: 'Confirmation reference', content: 'Saved text' },
    })).json()

    await goto(`/?note=${note.id}`, { waitUntil: 'hydration' })

    const trigger = page.getByRole('button', { name: action, exact: true })
    const dialog = page.getByRole('dialog', { name: action, exact: true })
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
    const confirm = dialog.getByRole('button', { name: action, exact: true })

    await page.getByLabel('Note content', { exact: true }).fill('Unsaved text retained')
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveAccessibleDescription(action === 'Archive Note'
      ? /restore it anytime/
      : /cannot be undone/)
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(confirm).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(confirm).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Unsaved text retained')
    expect(await (await page.request.get(`/api/notes/${note.id}`)).json()).toEqual(note)

    await trigger.click()
    await cancel.click()
    await expect(trigger).toBeFocused()
    await trigger.click()
    // Clicking outside is cancellation too, not an archive or an implicit save.
    await expect(cancel).toBeFocused()
    await page.locator('[data-slot="overlay"]').click({
      position: { x: 5, y: 5 },
    })
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Unsaved text retained')
    expect(await (await page.request.get(`/api/notes/${note.id}`)).json()).toEqual(note)

    // A transition from an edited note opens a second, programmatic dialog.
    await trigger.click()
    await confirm.click()

    const discard = page.getByRole('dialog', { name: 'Discard unsaved note?' })
    const keep = discard.getByRole('button', { name: 'Keep writing', exact: true })
    const discardAction = discard.getByRole('button', { name: 'Discard note', exact: true })

    await expect(discard).toHaveAccessibleDescription('Your note has not been saved. Leaving will discard your text.')
    await expect(keep).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(discardAction).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(keep).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(discardAction).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(keep).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(discard).toHaveCount(0)
    // The opener was the now-removed confirmation button; use the editor instead.
    await expect(page.getByLabel('Title', { exact: true })).toBeFocused()
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Unsaved text retained')
    expect(await (await page.request.get(`/api/notes/${note.id}`)).json()).toEqual(note)

    const navigation = page.getByRole('link', { name: 'All Notes', exact: true }).filter({ visible: true })

    await navigation.click()
    await expect(keep).toBeFocused()
    await keep.click()
    await expect(navigation).toBeFocused()
    await expect(page.getByLabel('Note content', { exact: true })).toHaveValue('Unsaved text retained')
    await navigation.click()
    await expect(keep).toBeFocused()
    await page.locator('[data-slot="overlay"]').click({
      position: { x: 5, y: 5 },
    })
    await expect(discard).toHaveCount(0)
    await expect(navigation).toBeFocused()
    expect(await (await page.request.get(`/api/notes/${note.id}`)).json()).toEqual(note)

    await trigger.click()
    await confirm.click()
    await discardAction.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Create New Note', exact: true }).filter({ visible: true })).toBeFocused()

    // Discarding ordinary Back navigation removes both its trigger and editor.
    for (const draft of [false, true]) {
      if (draft) {
        await page.getByRole('button', { name: 'Create New Note', exact: true }).filter({ visible: true }).click()
      } else {
        const saved = await (await page.request.post('/api/notes', {
          headers,
          data: { title: 'Back navigation reference' },
        })).json()

        await goto(`/?note=${saved.id}`, { waitUntil: 'hydration' })
      }

      await page.getByLabel('Note content', { exact: true }).fill('Unsaved navigation text')

      if (draft && testInfo.project.name === 'desktop')
        await page.goBack()
      else
        await page.getByRole('button', { name: 'Back to notes', exact: true }).filter({ visible: true }).click()
      await expect(keep).toBeFocused()
      await discardAction.click()
      await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0)

      if (testInfo.project.name === 'desktop')
        await expect(page.getByRole('button', { name: 'Create New Note', exact: true }).filter({ visible: true })).toBeFocused()
      else
        await expect(page.getByRole('button', { name: 'Back navigation reference', exact: true })).toBeFocused()
    }
  })
}
