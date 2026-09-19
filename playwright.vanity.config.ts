import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/vanity',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: true,
  workers: 2,
  retries: 0,
  reporter: 'line',
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
})
