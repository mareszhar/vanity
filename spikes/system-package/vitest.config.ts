import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true, // selenita's defineProject hooks into beforeAll/afterAll
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
