import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import Workflow from '../models/Workflow';
import WorkflowSchedule from '../models/WorkflowSchedule';
import mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { validateParams, validateBody } from '../middleware/validate';
import { objectIdSchema, scheduleSchema } from '../validation/schemas';
import { z } from 'zod';
import CronParser from 'cron-parser';

const router = Router();

const idParam = validateParams(z.object({ id: objectIdSchema }));

/**
 * @route GET /api/workflows/:id/schedule
 * @desc Get a workflow's schedule
 */
router.get('/:id/schedule', requireAuth, idParam, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Check if user has permission to view this workflow
    // For simplicity, we'll allow any authenticated user to view schedules
    // In a more secure implementation, we'd check ownership or roles

    const schedule = await WorkflowSchedule.findOne({ workflow: workflow._id });
    res.json({ schedule: schedule || null });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/workflows/:id/schedule
 * @desc Create or update a schedule for a workflow
 */
router.post('/:id/schedule', requireAuth, idParam, validateBody(scheduleSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Check if user has permission to modify this workflow
    // For simplicity, we'll allow any authenticated user to modify schedules
    // In a more secure implementation, we'd check ownership or roles

    const { type, cron, timezone, enabled } = req.body as {
      type?: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'cron';
      cron?: string;
      timezone?: string;
      enabled?: boolean;
    };

    if (!type) {
      return res.status(400).json({ error: 'Schedule type is required' });
    }

    // Validate cron expression if type is cron
    if (type === 'cron' && cron) {
      try {
        CronParser.parseExpression(cron, { currentDate: new Date() });
      } catch (error) {
        return res.status(400).json({ error: 'Invalid cron expression' });
      }
    }

    // Find existing schedule or create new one
    let schedule = await WorkflowSchedule.findOne({ workflow: workflow._id });

    if (schedule) {
      // Update existing schedule
      schedule.type = type;
      schedule.cron = type === 'cron' ? cron : undefined;
      schedule.timezone = timezone || 'UTC';
      schedule.enabled = enabled ?? true;

      // If it's a once schedule and we're setting it up for the first time, set nextRunAt
      if (type === 'once' && !schedule.nextRunAt) {
        schedule.nextRunAt = new Date(); // Run immediately for now, or could be set to future time
      }

      await schedule.save();
    } else {
      // Create new schedule
      schedule = new WorkflowSchedule({
        workflow: workflow._id,
        type,
        cron: type === 'cron' ? cron : undefined,
        timezone: timezone || 'UTC',
        enabled: enabled ?? true,
        nextRunAt: type === 'once' ? new Date() : undefined, // Run once schedules run immediately by default
      });

      await schedule.save();
    }

    res.json({ schedule });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/workflows/:id/schedule
 * @desc Delete a workflow's schedule
 */
router.delete('/:id/schedule', requireAuth, idParam, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Check if user has permission to modify this workflow
    // For simplicity, we'll allow any authenticated user to modify schedules

    const schedule = await WorkflowSchedule.findOneAndDelete({ workflow: workflow._id });
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;