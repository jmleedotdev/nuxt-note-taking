import type { Locator, Page } from '@playwright/test'
import { expect } from '@nuxt/test-utils/playwright'

// Start at a known form control, then use real forward/reverse keyboard traversal.
export async function expectKeyboardOrder(page: Page, controls: Locator[]) {
  await controls[0]!.focus()

  for (const [index, control] of controls.entries()) {
    await expect(control).toBeFocused()
    await expect(control).toHaveCSS('outline-style', 'solid')
    expect(Number.parseFloat(await control.evaluate(element => getComputedStyle(element).outlineWidth))).toBeGreaterThan(0)

    if (index < controls.length - 1)
      await page.keyboard.press('Tab')
  }

  for (const control of controls.slice(0, -1).reverse()) {
    await page.keyboard.press('Shift+Tab')
    await expect(control).toBeFocused()
  }
}

export async function togglePasswordWithKeyboard(page: Page, input: Locator, label: string) {
  await input.focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: `Show ${label}`, exact: true })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(input).toHaveAttribute('type', 'text')
  await expect(page.getByRole('button', { name: `Hide ${label}`, exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(input).toHaveAttribute('type', 'password')
}
