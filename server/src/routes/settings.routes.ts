import { Router } from 'express';
import {
  getSettingsHandler,
  getSettingHandler,
  setSettingHandler,
  initializeSettingsHandler
} from '../controllers/settings.controller';
import { RequireAuth, RequireRole } from '../middleware/requireAuth';

const router = Router();

// All settings routes require authentication
router.use(RequireAuth);

// Get all settings or specific settings by query keys
router.get('/', getSettingsHandler);

// Get a specific setting by key
router.get('/:key', getSettingHandler);

// Set a setting (requires workflow_admin or super_admin)
router.post('/', RequireRole(['workflow_admin', 'super_admin']), setSettingHandler);

// Initialize default settings (requires super_admin)
router.post('/initialize', RequireRole(['super_admin']), initializeSettingsHandler);

export default router;