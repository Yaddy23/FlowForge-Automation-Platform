import app from './app';
import dotenv from 'dotenv';
import { startSchedulerService } from './triggers/schedule';
import { startEventConsumer } from './triggers/event-consumer';
import { startWebhookConsumer } from './triggers/webhook-consumer';
import { initializeDefaultSettings } from './services/settings.service';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

let schedulerService: any = null;
let eventConsumer: any = null;
let webhookConsumer: any = null;

async function startServer() {
  try {
    // Initialize default settings
    await initializeDefaultSettings();

    // Start the scheduler service
    schedulerService = await startSchedulerService();

    // Start the event consumer
    eventConsumer = await startEventConsumer();

    // Start the webhook consumer and mount its app
    webhookConsumer = await startWebhookConsumer();
    app.use('/api/webhooks', webhookConsumer.getApp());

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
  process.exit(0);
});

startServer();