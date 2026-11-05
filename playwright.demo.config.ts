import type { ConfigOptions } from '@nuxt/test-utils/playwright'
import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Selected only by the disposable demo browser command. No fixture routes are
// mounted: this exercises ordinary demo mode with no mail configuration.
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
      nuxtConfig: {},
    },
  },
})
