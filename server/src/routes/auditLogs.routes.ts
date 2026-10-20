import { Router } from 'express';
import {
  getAuditLogsHandler,
  getAuditStatsHandler
} from '../controllers/audit.controller';
import { RequireAuth } from '../middleware/requireAuth';

const router = Router();

// All audit logs routes require authentication
router.use(RequireAuth);

// Get audit logs with filtering and pagination
router.get('/', getAuditLogsHandler);

// Get audit log statistics
router.get('/stats', getAuditStatsHandler);

export default router;