import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { list, getOne, retry, cancel, logs } from '../controllers/runs.controller';
import { MUTATE_ROLES } from '../controllers/workflow.controller';
import { validateParams } from '../middleware/validate';
import { objectIdSchema } from '../validation/schemas';
import { z } from 'zod';

const router = Router();

const idParam = validateParams(z.object({ id: objectIdSchema }));

router.get('/', requireAuth, list);
router.get('/:id', requireAuth, idParam, getOne);
router.get('/:id/logs', requireAuth, idParam, logs);
router.post('/:id/retry', requireAuth, requireRole(...MUTATE_ROLES), idParam, retry);
router.post('/:id/cancel', requireAuth, requireRole(...MUTATE_ROLES), idParam, cancel);

export default router;
