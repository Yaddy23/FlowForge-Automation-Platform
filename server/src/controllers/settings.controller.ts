import { Request, Response, NextFunction } from 'express';
import { setSetting, getSettings, initializeDefaultSettings } from '../services/settings.service';
import Settings from '../models/Settings';

/**
 * GET /api/settings
 * Get all settings or specific settings by query keys
 */
export const getSettingsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { keys } = req.query;
    let settings: Record<string, unknown>;

    if (keys && typeof keys === 'string') {
      const keyArray = keys.split(',').map(k => k.trim());
      settings = await getSettings(keyArray);
    } else {
      // Get all settings
      const allSettings = await Settings.find({});
      settings = {};
      allSettings.forEach(setting => {
        settings[setting.key] = setting.value;
      });
    }
    
    res.json({ settings });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/settings/:key
 * Get a specific setting by key
 */
export const getSettingHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    const setting = await Settings.findOne({ key });
    
    if (!setting) {
      return res.status(404).json({ error: `Setting not found: ${key}` });
    }
    
    res.json({ key: setting.key, value: setting.value, description: setting.description });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settings
 * Set a setting
 */
export const setSettingHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key, value, description } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }
    
    await setSetting(key, value, description);
    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settings/initialize
 * Initialize default settings (admin only)
 */
export const initializeSettingsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await initializeDefaultSettings();
    res.json({ message: 'Default settings initialized' });
  } catch (error) {
    next(error);
  }
};

// Middleware to ensure only super admins can access settings endpoints
// This should be applied in the routes
