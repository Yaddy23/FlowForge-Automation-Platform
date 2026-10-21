import app from './app';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { startSchedulerService } from './triggers/schedule';
import { startEventConsumer } from './triggers/event-consumer';
import { startWebhookConsumer } from './triggers/webhook-consumer';
import { startRetentionJob } from './jobs/retention';
import { startPollingWorker } from './queues/polling-worker';
import { initializeDefaultSettings } from './services/settings.service';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/flowforge';

let schedulerService: any = null;
let eventConsumer: any = null;
let webhookConsumer: any = null;
let retentionJob: any = null;
let pollingWorker: any = null;

/**
 * Connects to MongoDB, retrying briefly: on a managed platform the database can
 * still be starting when the web service boots, and a hard failure there would
 * crash-loop the deploy.
 */
async function connectToMongo(attempts = 10, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('[server] connected to MongoDB');
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === attempts) {
        throw new Error(`MongoDB unreachable after ${attempts} attempts: ${message}`);
      }
      console.warn(`[server] MongoDB attempt ${attempt}/${attempts} failed (${message}) — retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function startServer() {
  try {
    await connectToMongo();

    // Initialize default settings
    await initializeDefaultSettings();

    // Start the scheduler service
    schedulerService = await startSchedulerService();

    // Start the event consumer
    eventConsumer = await startEventConsumer();

    // Start the webhook consumer's worker; its HTTP app is mounted in app.ts
    webhookConsumer = await startWebhookConsumer();

    // Daily retention sweep + stalled-run recovery (null without Redis)
    retentionJob = await startRetentionJob();

    // Without Redis, enqueueing is a no-op and runs would stay queued forever.
    // RUN_POLLING_WORKER=true opts into executing them in-process instead.
    if (process.env.RUN_POLLING_WORKER === 'true') {
      pollingWorker = startPollingWorker();
      console.log('[server] RUN_POLLING_WORKER=true — executing queued runs in-process (no Redis)');
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('SIGINT received: shutting down gracefully');
  if (eventConsumer) {
    await eventConsumer.stop();
  }
  if (schedulerService) {
    await schedulerService.stop();
  }
  if (webhookConsumer) {
    await webhookConsumer.stop();
  }
  if (retentionJob) {
    await retentionJob.stop();
  }
  if (pollingWorker) {
    await pollingWorker.stop();
  }
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received: shutting down gracefully');
  if (eventConsumer) {
    await eventConsumer.stop();
  }
  if (schedulerService) {
    await schedulerService.stop();
  }
  if (webhookConsumer) {
    await webhookConsumer.stop();
  }
  if (retentionJob) {
    await retentionJob.stop();
  }
  if (pollingWorker) {
    await pollingWorker.stop();
  }
  await mongoose.disconnect();
  process.exit(0);
});

startServer();