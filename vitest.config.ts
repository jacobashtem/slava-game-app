import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'game-engine/__tests__/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '~/': new URL('./', import.meta.url).pathname,
    },
  },
})
