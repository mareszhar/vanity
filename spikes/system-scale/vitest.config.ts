import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true, // selenita's defineProject hooks into beforeAll/afterAll
    include: ['tests/**/*.test.ts'],
    // Selenita queries against the large generated module are slow-ish by
    // design (they exercise a realistic project); give them room, bounded.
    testTimeout: 120_000,
  },
})
