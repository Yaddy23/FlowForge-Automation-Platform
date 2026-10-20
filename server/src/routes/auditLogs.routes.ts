import { Router } from 'express';
import {
  getAuditLogsHandler,
  getAuditStatsHandler,
} from '../controllers/audit.controller';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { listQuerySchema } from '../validation/schemas';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(listQuerySchema), getAuditLogsHandler);
router.get('/stats', getAuditStatsHandler);

export default router;
