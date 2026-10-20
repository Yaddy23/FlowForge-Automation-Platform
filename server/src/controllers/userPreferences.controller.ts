import { Request, Response, NextFunction } from 'express';
import { getUserPreferences, updateUserPreferences } from '../services/userPreferences.service';

/**
 * GET /api/user/preferences
 * Get the current user's preferences
 */
export const getUserPreferencesHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const preferences = await getUserPreferences(userId);
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/user/preferences
 * Update the current user's preferences
 */
export const updateUserPreferencesHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updates = req.body;
    const preferences = await updateUserPreferences(userId, updates);
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
};

// Middleware to ensure authentication is applied in the routes