import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testIgnore: 'dev/**',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: true,
  // Server startup dominates this compact suite. Two browser workers retain
  // useful parallelism with far less process and memory overhead than one
  // Chromium per test file.
  workers: 2,
  retries: 0,
  reporter: 'line',
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node .output/server/index.mjs',
      cwd: './sandbox/demo-main',
      env: { PORT: '3100' },
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm exec vite preview --host 127.0.0.1 --port 4173',
      cwd: './sandbox/demo-comparisons',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
