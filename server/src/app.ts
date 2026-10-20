import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import { requireAuth, requireRole } from './middleware/auth';
import openapiRoutes from './docs/openapi';
import workflowRoutes from './routes/workflow.routes';
import runsRoutes from './routes/runs.routes';
import templateRoutes from './routes/templates.routes';
import scheduleRoutes from './routes/schedules.routes';
import eventsRoutes from './routes/events.routes';
import credentialsRoutes from './routes/credentials.routes';
import settingsRoutes from './routes/settings.routes';
import userPreferencesRoutes from './routes/userPreferences.routes';
import notificationRoutes from './routes/notifications.routes';
import auditLogsRoutes from './routes/auditLogs.routes';
import userRoutes from './routes/users.routes';
import { applySecurityMiddleware, apiLimiter } from './middleware/security';
import { webhookConsumer } from './triggers/webhook-consumer';
// Import other routes here as they are created

// Load environment variables
dotenv.config();

const app = express();

// Security headers, CORS, body limits
applySecurityMiddleware(app);

// General rate limit on all API routes
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/docs', openapiRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/workflows', scheduleRoutes); // :id/schedule subresource of workflows
app.use('/api/runs', runsRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/credentials', credentialsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/user/preferences', userPreferencesRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/users', userRoutes);
// Webhook trigger endpoint (shared consumer instance; index.ts starts its worker)
app.use(webhookConsumer.getApp());
// Mount other routers under /api as needed

// Test routes (only in test environment)
if (process.env.NODE_ENV === 'test') {
  const testRouter = express.Router();
  // Protected route for testing requireRole
  testRouter.get('/rbac', requireAuth, requireRole('super_admin'), (_req: Request, res: Response) => {
    res.json({ message: 'RBAC test route accessed' });
  });
  app.use('/api/test', testRouter);
}

// Catch-all error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// 404 handler
app.use('*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

export default app;