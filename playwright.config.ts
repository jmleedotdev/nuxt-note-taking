import type { ConfigOptions } from '@nuxt/test-utils/playwright'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig<ConfigOptions>({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    nuxt: {
      rootDir: fileURLToPath(new URL('.', import.meta.url)),
      port: 3000,
      nuxtConfig: {
        nitro: {
          handlers: [
            {
              route: '/__test/mail',
              handler: fileURLToPath(new URL('./test/fixtures/mail.ts', import.meta.url)),
            },
          ],
        },
      },
    },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1099, height: 1024 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 549, height: 812 },
      },
    },
  ],
})
