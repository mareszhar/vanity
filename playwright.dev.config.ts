import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/dev',
  timeout: 45_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: 'line',
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --dir sandbox/demo-main run dev --host 127.0.0.1 --port 3200 --no-fork',
    cwd: '.',
    // desktop sandboxes can exhaust native watcher handles while
    // Nuxt scans the pnpm graph. Polling keeps the product behavior under test
    // identical without turning a host watcher limit into a false failure.
    env: {
      CHOKIDAR_USEPOLLING: 'true',
      CHOKIDAR_INTERVAL: '100',
    },
    url: 'http://127.0.0.1:3200',
    reuseExistingServer: false,
    timeout: 45_000,
  },
})
