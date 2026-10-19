import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import { requireAuth, requireRole } from './middleware/auth';
import openapiRoutes from './docs/openapi';
import workflowRoutes from './routes/workflow.routes';
// Import other routes here as they are created

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/docs', openapiRoutes);
app.use('/api/workflows', workflowRoutes);
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