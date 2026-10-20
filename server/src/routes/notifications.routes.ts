import { Router } from 'express';
import {
  getNotificationsHandler,
  markAsReadHandler,
  markAllAsReadHandler,
  deleteNotificationHandler,
  deleteAllNotificationsHandler
} from '../controllers/notification.controller';
import { RequireAuth } from '../middleware/requireAuth';

const router = Router();

// All notification routes require authentication
router.use(RequireAuth);

// Get notifications for the current user
router.get('/', getNotificationsHandler);

// Mark a notification as read
router.put('/:id/read', markAsReadHandler);

// Mark all notifications as read
router.put('/read-all', markAllAsReadHandler);

// Delete a notification
router.delete('/:id', deleteNotificationHandler);

// Delete all notifications
router.delete('/', deleteAllNotificationsHandler);

export default router;