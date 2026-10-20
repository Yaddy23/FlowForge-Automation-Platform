import { Router } from 'express';
import {
  getUserPreferencesHandler,
  updateUserPreferencesHandler,
} from '../controllers/userPreferences.controller';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { updatePreferencesSchema } from '../validation/schemas';

const router = Router();

router.use(requireAuth);

router.get('/', getUserPreferencesHandler);
router.put('/', validateBody(updatePreferencesSchema), updateUserPreferencesHandler);

export default router;
