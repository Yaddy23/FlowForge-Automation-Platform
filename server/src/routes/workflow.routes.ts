import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  create,
  list,
  getOne,
  update,
  remove,
  saveVersion,
  listVersions,
  activate,
  pause,
  execute,
  diff,
  restore,
  MUTATE_ROLES,
  ACTIVATE_ROLES,
} from '../controllers/workflow.controller';
import { validateBody, validateParams } from '../middleware/validate';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  saveVersionSchema,
  restoreVersionSchema,
  executeWorkflowSchema,
  objectIdSchema,
  versionParamsSchema,
} from '../validation/schemas';

const router = Router();

const idParam = validateParams(z.object({ id: objectIdSchema }));

router.post('/', requireAuth, requireRole(...MUTATE_ROLES), validateBody(createWorkflowSchema), create);
router.get('/', requireAuth, list);
router.get('/:id', requireAuth, idParam, getOne);
router.patch('/:id', requireAuth, requireRole(...MUTATE_ROLES), idParam, validateBody(updateWorkflowSchema), update);
router.delete('/:id', requireAuth, requireRole(...MUTATE_ROLES), idParam, remove);
router.post('/:id/versions', requireAuth, requireRole(...MUTATE_ROLES), idParam, validateBody(saveVersionSchema), (req, res, next) => {
  return saveVersion(req, res, next);
});
router.get('/:id/versions', requireAuth, idParam, listVersions);
router.post('/:id/activate', requireAuth, requireRole(...ACTIVATE_ROLES), idParam, activate);
router.post('/:id/pause', requireAuth, requireRole(...ACTIVATE_ROLES), idParam, pause);
router.post('/:id/execute', requireAuth, requireRole(...MUTATE_ROLES), idParam, validateBody(executeWorkflowSchema), execute);
router.get('/:id/versions/:version1/diff/:version2', requireAuth, validateParams(versionParamsSchema), diff);
router.post('/:id/versions/:version/restore', requireAuth, idParam, validateBody(restoreVersionSchema), restore);

export default router;
