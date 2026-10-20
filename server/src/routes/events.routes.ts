import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { enqueueEvent } from '../queues';
import { validateBody } from '../middleware/validate';
import { publishEventSchema } from '../validation/schemas';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

/**
 * @route POST /api/events
 * @desc Publish an event to the internal event bus (service-auth only)
 * @access Private (super_admin only)
 */
router.post(
  '/',
  requireAuth,
  requireRole('super_admin'),
  validateBody(publishEventSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventName, eventId, payload } = req.body;

      // Generate an eventId if not provided
      const finalEventId =
        eventId || `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      await enqueueEvent(eventName, finalEventId, payload || {});

      res.status(202).json({
        message: 'Event published successfully',
        eventId: finalEventId,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
