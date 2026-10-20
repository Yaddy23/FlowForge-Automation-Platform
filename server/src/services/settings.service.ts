import Settings from '../models/Settings';

/**
 * Get a setting by key
 * @param key - The setting key
 * @param defaultValue - Default value if setting doesn't exist
 */
export const getSetting = async <T>(key: string, defaultValue?: T): Promise<T | undefined> => {
  const setting = await Settings.findOne({ key });
  return setting ? setting.value : defaultValue;
};

/**
 * Set a setting by key
 * @param key - The setting key
 * @param value - The setting value
 * @param description - Optional description
 */
export const setSetting = async <T>(key: string, value: T, description?: string): Promise<void> => {
  await Settings.findOneAndUpdate(
    { key },
    { value, description },
    { upsert: true, new: true }
  );
};

/**
 * Get multiple settings
 * @param keys - Array of setting keys
 */
export const getSettings = async (keys: string[]): Promise<Record<string, any>> => {
  const settings = await Settings.find({ key: { $in: keys } });
  const result: Record<string, any> = {};
  
  settings.forEach(setting => {
    result[setting.key] = setting.value;
  });
  
  return result;
};

/**
 * Initialize default settings if they don't exist
 */
export const initializeDefaultSettings = async (): Promise<void> => {
  const defaults = [
    { key: 'retentionDays', value: 30, description: 'Number of days to retain execution logs' },
    { key: 'maxConcurrentWorkflows', value: 5, description: 'Maximum number of concurrent workflow executions' },
    { key: 'maxConcurrentExecutionsPerWorkflow', value: 2, description: 'Maximum concurrent executions per workflow' },
    { key: 'queueStallTimeoutMinutes', value: 30, description: 'Timeout in minutes before considering a queue stalled' },
    { key: 'enableEmailNotifications', value: false, description: 'Global toggle for email notifications' },
    { key: 'emailFromAddress', value: 'noreply@flowforge.dev', description: 'From address for email notifications' },
  ];
  
  for (const def of defaults) {
    const existing = await Settings.findOne({ key: def.key });
    if (!existing) {
      await Settings.create(def);
    }
  }
};
