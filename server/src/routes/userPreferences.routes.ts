import { Router } from 'express';
import {
  getUserPreferencesHandler,
  updateUserPreferencesHandler
} from '../controllers/userPreferences.controller';
import { RequireAuth } from '../middleware/requireAuth';

const router = Router();

// All user preferences routes require authentication
router.use(RequireAuth);

// Get the current user's preferences
router.get('/', getUserPreferencesHandler);

// Update the current user's preferences
router.put('/', updateUserPreferencesHandler);

export default router;