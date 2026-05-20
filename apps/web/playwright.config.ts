/**
 * Playwright configuration for the Corastate web UI smoke tests.
 *
 * The tests boot the backend + the web app from the workspace root via
 * `webServer` so a single `pnpm test:ui` from any directory does the whole
 * lifecycle. The backend reads .env from the repo root (via dotenv-cli),
 * so the test runner assumes:
 *   - Postgres is up (`docker compose up -d`)
 *   - Migrations have been applied (`pnpm migrate`)
 *   - Demo data is seeded (`pnpm seed`)
 *
 * The README's walkthrough lists those four steps before `pnpm test:ui`.
 *
 * Architecture-v3 reminder: the API process must NOT have CORASTATE_MASTER_KEY
 * set. dotenv-cli loads it for the worker; the backend ignores it.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: 'pnpm backend:dev',
          cwd: repoRoot,
          port: 4000,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          command: 'pnpm web:dev',
          cwd: repoRoot,
          port: 5173,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],
});
