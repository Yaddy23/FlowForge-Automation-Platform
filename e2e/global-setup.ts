import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Seeds the E2E database with the four demo accounts and the five built-in
 * templates, by shelling out to the server's own seed script so the E2E data
 * can never drift from the app's definition of it.
 *
 * Two ways in:
 *  - Playwright starts the stack itself (no PLAYWRIGHT_BASE_URL): wait for
 *    mongod to answer, then seed. The wait matters because Playwright's
 *    `webServer` entries and global setup are not ordered against each other.
 *  - The specs are pointed at a stack we did not start (PLAYWRIGHT_BASE_URL):
 *    seed only when E2E_MONGODB_URI names the database explicitly, so a Render
 *    deploy is never written to just because someone ran the suite at it.
 */
const MONGO_HEALTH_URL = process.env.E2E_MONGO_HEALTH_URL ?? 'http://127.0.0.1:27019/health';
const managesOwnStack = !process.env.PLAYWRIGHT_BASE_URL;
const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/flowforge-e2e';

async function waitForMongo(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(MONGO_HEALTH_URL);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`E2E MongoDB not reachable at ${MONGO_HEALTH_URL} within ${timeoutMs}ms`);
}

export default async function globalSetup(): Promise<void> {
  if (!managesOwnStack && !process.env.E2E_MONGODB_URI) return;
  if (managesOwnStack) await waitForMongo();

  execSync('npx tsx src/scripts/seed.ts', {
    cwd: path.join(process.cwd(), 'server'),
    env: { ...process.env, MONGODB_URI: E2E_MONGODB_URI },
    stdio: 'inherit',
  });
}
