import UserPreferences from '../models/UserPreferences';
import { Types } from 'mongoose';

/**
 * Get user preferences by user ID
 * @param userId - The user's ID
 */
export const getUserPreferences = async (userId: string | Types.ObjectId): Promise<any> => {
  const prefs = await UserPreferences.findOne({ userId });
  if (!prefs) {
    // Create default preferences if none exist
    return await UserPreferences.create({ userId });
  }
  return prefs;
};

/**
 * Update user preferences
 * @param userId - The user's ID
 * @param updates - Partial updates to apply
 */
export const updateUserPreferences = async (
  userId: string | Types.ObjectId,
  updates: Partial<{ emailNotifications: boolean; inAppNotifications: boolean; notificationFrequency: 'immediate' | 'hourly' | 'daily' }>
): Promise<any> => {
  return await UserPreferences.findOneAndUpdate(
    { userId },
    { $set: updates },
    { upsert: true, new: true }
  );
};
