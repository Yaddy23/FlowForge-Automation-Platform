import { Router } from 'express';
import {
  getNotificationsHandler,
  markAsReadHandler,
  markAllAsReadHandler,
  deleteNotificationHandler,
  deleteAllNotificationsHandler,
} from '../controllers/notification.controller';
import { requireAuth } from '../middleware/auth';
import { validateParams, validateQuery } from '../middleware/validate';
import { objectIdSchema, listQuerySchema } from '../validation/schemas';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(listQuerySchema), getNotificationsHandler);
router.put('/read-all', markAllAsReadHandler);
router.put('/:id/read', validateParams(objectIdSchema), markAsReadHandler);
router.delete('/:id', validateParams(objectIdSchema), deleteNotificationHandler);
router.delete('/', deleteAllNotificationsHandler);

export default router;
