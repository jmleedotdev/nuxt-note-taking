import { defineConfig } from 'vitest/config'

// Opt-in transport smoke test; the routine suite keeps its memory sender.
export default defineConfig({
  test: {
    include: ['test/local-mail/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 120000,
  },
})
