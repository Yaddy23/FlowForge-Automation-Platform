import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration for the critical paths.
 *
 * By default Playwright starts its own stack — a throwaway mongod, the API, and
 * the Vite dev server — so the suite runs with no Docker and no local MongoDB.
 * Setting PLAYWRIGHT_BASE_URL points the same specs at an already-running stack
 * (docker compose --profile e2e, or a Render deploy) and skips all three
 * servers, plus the seeding, since that stack owns its own data.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001';
const MONGO_PORT = process.env.E2E_MONGO_PORT ?? '27018';
const MONGO_HEALTH_PORT = process.env.E2E_MONGO_HEALTH_PORT ?? '27019';
const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ?? `mongodb://127.0.0.1:${MONGO_PORT}/flowforge-e2e`;

const managesOwnStack = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // A manual run is executed by the API's worker rather than inline, so the
  // journey waits on real background work, not just page loads.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // The specs share one database and assert on each other's absence, so they
  // run in order in a single worker.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: managesOwnStack
    ? [
        {
          command: 'npx tsx server/src/scripts/e2e-mongo.ts',
          url: `http://127.0.0.1:${MONGO_HEALTH_PORT}/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: 'pipe',
        },
        {
          command: 'npx tsx src/index.ts',
          cwd: 'server',
          url: `${API_URL}/api/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            NODE_ENV: 'test',
            MONGODB_URI: E2E_MONGODB_URI,
            PORT: '3001',
            // This stack has no Redis, so enqueueing is a no-op. Without the
            // polling worker a manual run would sit `queued` forever.
            RUN_POLLING_WORKER: 'true',
          },
        },
        {
          // --strictPort matters: without it a busy 5173 silently shifts Vite to
          // 5174 and Playwright would wait on a URL nothing is serving.
          // --host 127.0.0.1 matters just as much: Vite's default host is
          // `localhost`, which on Windows resolves to IPv6 ::1, so the poll of
          // the IPv4 127.0.0.1 BASE_URL is refused and this entry times out.
          command: 'npm run dev -- --port 5173 --strictPort --host 127.0.0.1',
          cwd: 'client',
          url: BASE_URL,
          reuseExistingServer: false,
          timeout: 120_000,
          env: { VITE_API_URL: `${API_URL}/api` },
        },
      ]
    : undefined,
});
