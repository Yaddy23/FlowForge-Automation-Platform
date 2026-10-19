import { Router } from 'express';
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

const router = Router();

router.post('/', requireAuth, requireRole(...MUTATE_ROLES), create);
router.get('/', requireAuth, list);
router.get('/:id', requireAuth, getOne);
router.patch('/:id', requireAuth, requireRole(...MUTATE_ROLES), update);
router.delete('/:id', requireAuth, requireRole(...MUTATE_ROLES), remove);
router.post('/:id/versions', requireAuth, requireRole(...MUTATE_ROLES), (req, res, next) => {
  console.log(`saveVersion called: ${req.method} ${req.path}`);
  return saveVersion(req, res, next);
});
router.get('/:id/versions', requireAuth, listVersions);
router.post('/:id/activate', requireAuth, requireRole(...ACTIVATE_ROLES), activate);
router.post('/:id/pause', requireAuth, requireRole(...ACTIVATE_ROLES), pause);
router.post('/:id/execute', requireAuth, requireRole(...MUTATE_ROLES), execute);
router.get('/:id/versions/:version1/diff/:version2', requireAuth, diff);
router.post('/:id/versions/:version/restore', requireAuth, restore);

export default router;