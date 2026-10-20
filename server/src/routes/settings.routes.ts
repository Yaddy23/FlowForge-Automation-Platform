import { Router } from 'express';
import {
  getSettingsHandler,
  getSettingHandler,
  setSettingHandler,
  initializeSettingsHandler,
} from '../controllers/settings.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { setSettingSchema, listQuerySchema, settingKeyParamSchema } from '../validation/schemas';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(listQuerySchema), getSettingsHandler);
router.get('/:key', validateParams(settingKeyParamSchema), getSettingHandler);
router.post('/', requireRole('workflow_admin', 'super_admin'), validateBody(setSettingSchema), setSettingHandler);
router.post('/initialize', requireRole('super_admin'), initializeSettingsHandler);

export default router;
