import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { list, getOne, retry, cancel, logs } from '../controllers/runs.controller';
import { MUTATE_ROLES } from '../controllers/workflow.controller';

const router = Router();

router.get('/', requireAuth, list);
router.get('/:id', requireAuth, getOne);
router.get('/:id/logs', requireAuth, logs);
router.post('/:id/retry', requireAuth, requireRole(...MUTATE_ROLES), retry);
router.post('/:id/cancel', requireAuth, requireRole(...MUTATE_ROLES), cancel);

export default router;
