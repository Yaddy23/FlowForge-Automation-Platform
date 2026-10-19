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
  MUTATE_ROLES,
  ACTIVATE_ROLES,
} from '../controllers/workflow.controller';

const router = Router();

router.post('/', requireAuth, requireRole(...MUTATE_ROLES), create);
router.get('/', requireAuth, list);
router.get('/:id', requireAuth, getOne);
router.patch('/:id', requireAuth, requireRole(...MUTATE_ROLES), update);
router.delete('/:id', requireAuth, requireRole(...MUTATE_ROLES), remove);
router.post('/:id/versions', requireAuth, requireRole(...MUTATE_ROLES), saveVersion);
router.get('/:id/versions', requireAuth, listVersions);
router.post('/:id/activate', requireAuth, requireRole(...ACTIVATE_ROLES), activate);
router.post('/:id/pause', requireAuth, requireRole(...ACTIVATE_ROLES), pause);

export default router;
