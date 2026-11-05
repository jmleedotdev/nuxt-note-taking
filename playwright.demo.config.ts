import type { ConfigOptions } from '@nuxt/test-utils/playwright'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Selected only by the disposable demo browser command. Lifecycle controls and
// the clock replacement are never mounted in ordinary builds.
process.env.APP_ENV = 'demo'
process.env.MAIL_MODE = ''
process.env.MAILTRAP_URL = ''

export default defineConfig<ConfigOptions>({
  ...base,
  testIgnore: [],
  testMatch: 'demo.spec.ts',
  use: {
    ...base.use,
    nuxt: {
      ...base.use?.nuxt,
      nuxtConfig: {
        alias: {
          '#demo-clock': fileURLToPath(new URL('./test/fixtures/demo-clock.ts', import.meta.url)),
        },
        nitro: {
          handlers: [
            {
              route: '/__test/demo-lifecycle',
              handler: fileURLToPath(new URL('./test/fixtures/demo-lifecycle.ts', import.meta.url)),
            },
          ],
        },
      },
    },
  },
})
