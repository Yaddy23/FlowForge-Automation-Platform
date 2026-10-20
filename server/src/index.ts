import app from './app';
import dotenv from 'dotenv';
import { startSchedulerService } from './triggers/schedule';
import { startEventConsumer } from './triggers/event-consumer';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

let schedulerService: any = null;
let eventConsumer: any = null;

async function startServer() {
  try {
    // Start the scheduler service
    schedulerService = await startSchedulerService();

    // Start the event consumer
    eventConsumer = await startEventConsumer();

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
  process.exit(0);
});

startServer();