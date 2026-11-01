import { defineConfig, devices } from '@playwright/test';

/**
 * E2E of the demo path. Read-only: no wallet, no signing, no transaction.
 * Runs against the live deploy by default. Point it elsewhere with
 * E2E_BASE_URL, for example `E2E_BASE_URL=http://localhost:5173`.
 *
 * Retries are off on purpose. The rebuild has its own retry logic for the
 * load balanced Arc RPC, and a test that passes only on a second run would
 * hide a real failure.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'https://conciliado.acachete.xyz';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
