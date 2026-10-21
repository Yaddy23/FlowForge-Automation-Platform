import http from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Boots a throwaway mongod for the Playwright E2E stack on a fixed port and
 * keeps it alive until signalled. Uses the same cached binary as the vitest
 * suite, so the E2E stack needs no Docker and no local MongoDB install.
 *
 * mongod speaks the wire protocol, not HTTP, so Playwright's `webServer` has
 * nothing to poll. This process therefore also exposes a small /health endpoint
 * that reports 200 only once mongod is accepting connections. That is the URL
 * playwright.config.ts waits on, which is what guarantees the API boots against
 * a live database and that global-setup can seed it.
 */
const PORT = parseInt(process.env.E2E_MONGO_PORT ?? '27018', 10);
const HEALTH_PORT = parseInt(process.env.E2E_MONGO_HEALTH_PORT ?? '27019', 10);

async function main(): Promise<void> {
  const server = await MongoMemoryServer.create({
    instance: { port: PORT, dbName: 'flowforge-e2e' },
  });

  let ready = false;
  const health = http.createServer((_req, res) => {
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ready ? { status: 'ok', uri: server.getUri() } : { status: 'starting' }));
  });
  health.listen(HEALTH_PORT, '127.0.0.1', () => {
    console.log(`[e2e-mongo] health on http://127.0.0.1:${HEALTH_PORT}/health`);
  });

  ready = true;
  console.log(`[e2e-mongo] listening on ${server.getUri()}`);

  const stop = async (): Promise<void> => {
    health.close();
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

void main();
