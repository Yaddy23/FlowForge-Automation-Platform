import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import WorkflowTemplate from '../models/WorkflowTemplate';
import Workflow from '../models/Workflow';
import WorkflowVersion from '../models/WorkflowVersion';
import mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { validateParams } from '../middleware/validate';
import { objectIdSchema } from '../validation/schemas';
import { z } from 'zod';

const router = Router();

/**
 * @route GET /api/templates
 * @desc List all available workflow templates
 */
router.get('/', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await WorkflowTemplate.find().select('-definition'); // exclude definition for list
    res.json({ data: templates });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/templates/:id/instantiate
 * @desc Create a new draft workflow from a template for the current user
 */
router.post(
  '/:id/instantiate',
  requireAuth,
  validateParams(z.object({ id: objectIdSchema })),
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await WorkflowTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Create a new workflow from the template
    const workflow = new Workflow({
      name: `${template.name} (copy)`,
      description: template.description,
      owner: req.user!.id,
      status: 'draft',
      latestVersion: 0,
      activeVersion: null,
    });

    await workflow.save();

    // Create version 1 from the template definition
    const version = await new mongoose.Types.ObjectId(); // placeholder, we'll create the actual version doc
    const versionDoc = new WorkflowVersion({
      workflow: workflow._id,
      version: 1,
      definition: template.definition,
      createdBy: req.user!.id,
    });

    await versionDoc.save();

    // Update workflow's latestVersion to 1
    workflow.latestVersion = 1;
    await workflow.save();

    res.status(201).json({ workflow, version: versionDoc });
  } catch (error) {
    next(error);
  }
  }
);

export default router;