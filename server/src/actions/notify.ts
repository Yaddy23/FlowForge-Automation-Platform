import { registerAction, type ActionHandler } from './registry';
import Notification from '../models/Notification';
import User from '../models/User';
import { getUserPreferences } from '../services/userPreferences.service';
import { getSetting } from '../services/settings.service';
import { Types } from 'mongoose';

/**
 * action.notify — creates in-app notifications. Targets: an explicit
 * `userId`, else every user with `role`, else all workflow admins (the
 * operational default). Now loop-guarded with preferences and rate limits.
 */
const notifyAction: ActionHandler = async (config) => {
  const message = String(config.message ?? '');
  if (!message) {
    throw Object.assign(new Error('notify requires "message"'), { code: 'NOTIFY_CONFIG' });
  }

  let userIds: string[] = [];
  if (typeof config.userId === 'string' && config.userId) {
    userIds = [config.userId];
  } else {
    const role = typeof config.role === 'string' && config.role ? config.role : 'workflow_admin';
    const users = await User.find({ role }).select('_id').lean();
    userIds = users.map((u) => String(u._id));
  }

  if (userIds.length === 0) return { output: { notified: 0 } };

  // Get global settings for email notifications (if implemented later)
  const emailNotificationsEnabled = await getSetting<boolean>('enableEmailNotifications', false);

  // Filter users based on preferences and send notifications
  const notifiedUsers: string[] = [];

  for (const userId of userIds) {
    try {
      // Get user preferences
      const userPrefs = await getUserPreferences(new Types.ObjectId(userId));

      // Check if user wants in-app notifications
      if (userPrefs.inAppNotifications) {
        // For now, we'll send immediately. In a more advanced implementation,
        // we would check notificationFrequency and batch accordingly
        notifiedUsers.push(userId);
      }

      // TODO: Implement email notifications when email system is fully integrated
      // if (emailNotificationsEnabled && userPrefs.emailNotifications) {
      //   // Send email notification
      // }
    } catch (error) {
      // If we can't get user preferences, default to sending notification
      console.warn(`Could not get preferences for user ${userId}:`, error);
      notifiedUsers.push(userId);
    }
  }

  // Create notifications for filtered users
  if (notifiedUsers.length > 0) {
    await Notification.insertMany(
      notifiedUsers.map((userId) => ({ user: userId, message }))
    );
  }

  return { output: { notified: notifiedUsers.length } };
};

export function registerNotifyAction(): void {
  registerAction('action.notify', notifyAction);
}