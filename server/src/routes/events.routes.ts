import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { publishEvent } from '../triggers/event-consumer';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

/**
 * @route POST /api/events
 * @desc Publish an event to the internal event bus (service-auth only)
 * @access Private (service accounts only)
 */
router.post('/', requireAuth, requireRole('super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventName, eventId, payload } = req.body as {
      eventName: string;
      eventId?: string;
      payload?: Record<string, unknown>;
    };

    if (!eventName) {
      return res.status(400).json({ error: 'eventName is required' });
    }

    // Generate an eventId if not provided
    const finalEventId = eventId || `${eventName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Publish the event
    await publishEvent(eventName, finalEventId, payload || {});

    res.status(202).json({
      message: 'Event published successfully',
      eventId: finalEventId
    });
  } catch (error) {
    next(error);
  }
});

export default router;