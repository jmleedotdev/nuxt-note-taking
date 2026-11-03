// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/test-utils/module',
    '@nuxt/ui',
  ],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  eslint: {
    config: {
      standalone: false,
      formatters: {
        css: true,
        html: true,
        markdown: 'prettier',
      },
    },
  },

  icon: {
    customCollections: [
      {
        prefix: 'app',
        dir: './app/assets/icons',
      },
    ],
  },

  fonts: {
    families: [
      {
        name: 'Inter',
        weights: [400, 500, 600, 700],
        provider: 'local',
      },
      {
        name: 'Noto Serif',
        weights: [400, 500, 600, 700],
        provider: 'local',
      },
      {
        name: 'Source Code Pro',
        weights: [400, 500, 600, 700],
        provider: 'local',
      },
    ],
    local: {
      dirs: ['public/fonts'],
    },
  },
})
