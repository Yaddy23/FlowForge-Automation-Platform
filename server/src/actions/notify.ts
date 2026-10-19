import { registerAction, type ActionHandler } from './registry';
import Notification from '../models/Notification';
import User from '../models/User';

/**
 * action.notify — creates in-app notifications. Targets: an explicit
 * `userId`, else every user with `role`, else all workflow admins (the
 * operational default). Loop-guarded notification fan-out (rate limits,
 * preferences) lands in Task 17.
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
  await Notification.insertMany(userIds.map((user) => ({ user, message })));
  return { output: { notified: userIds.length } };
};

export function registerNotifyAction(): void {
  registerAction('action.notify', notifyAction);
}
