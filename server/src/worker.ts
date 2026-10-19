import 'dotenv/config';
import mongoose from 'mongoose';
import { startRunWorker, closeQueues } from './queues';

/**
 * Standalone BullMQ worker process (`npm run worker`): consumes the
 * workflow-runs queue and executes runs via the Task 8 engine. Requires
 * REDIS_URL (and MONGODB_URI); exits when Redis is not configured.
 */
async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/flowforge');
  const worker = await startRunWorker();
  if (!worker) {
    console.error('[worker] REDIS_URL is not set — cannot start worker');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('[worker] workflow-runs worker started');

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received — closing`);
    await worker.close();
    await closeQueues();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
