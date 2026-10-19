import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Workflow, { IWorkflow } from '../models/Workflow';
import WorkflowVersion from '../models/WorkflowVersion';
import { validateDefinition } from '../services/workflow-validator.service';
import type { WorkflowDefinition } from 'shared/types/workflow';
import type { Role } from '../models/User';

const MUTATE_ROLES: Role[] = ['workflow_builder', 'workflow_admin', 'super_admin'];
const ACTIVATE_ROLES: Role[] = ['workflow_admin', 'super_admin'];

function isAdminPlus(role: string): boolean {
  return role === 'workflow_admin' || role === 'super_admin';
}

function canManage(workflow: IWorkflow, userId: string, role: string): boolean {
  if (isAdminPlus(role)) return true;
  return workflow.owner.toString() === userId;
}

/**
 * Full registry-based validation (Task 5). Draft saves include the result as
 * warnings (drafts may be invalid); activation hard-fails on any error.
 */
function validateForDraft(def: WorkflowDefinition) {
  return validateDefinition(def);
}

/**
 * @route POST /api/workflows
 * @desc Create workflow (with optional initial definition → version 1)
 */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, definition } = req.body as {
      name?: string;
      description?: string;
      definition?: WorkflowDefinition;
    };
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const workflow = new Workflow({
      name: name.trim(),
      description,
      owner: new mongoose.Types.ObjectId(req.user!.id),
      status: 'draft',
      latestVersion: 0,
      activeVersion: null,
    });

    let version = null;
    if (definition) {
      // Draft versions accept any definition (full validation gates activation only)
      version = new WorkflowVersion({
        workflow: workflow._id,
        version: 1,
        definition,
        createdBy: req.user!.id,
      });
      workflow.latestVersion = 1;
    }

    await workflow.save();
    if (version) await version.save();

    res.status(201).json({ workflow, version });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/workflows
 * @desc List workflows (paginated, filterable by status/owner)
 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.owner) {
      filter.owner = req.query.owner === 'me' ? req.user!.id : req.query.owner;
    }

    const [data, total] = await Promise.all([
      Workflow.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('owner', 'name email'),
      Workflow.countDocuments(filter),
    ]);

    res.json({ data, page, limit, total });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/workflows/:id
 * @desc Get a single workflow
 */
export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id).populate('owner', 'name email');
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ workflow });
  } catch (error) {
    next(error);
  }
};

/**
 * @route PATCH /api/workflows/:id
 * @desc Update name/description. Builders/admins mutate only their own unless workflow_admin+.
 */
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    if (!canManage(workflow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const { name, description } = req.body as { name?: string; description?: string };
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
      workflow.name = name.trim();
    }
    if (description !== undefined) workflow.description = description;
    await workflow.save();
    res.json({ workflow });
  } catch (error) {
    next(error);
  }
};

/**
 * @route DELETE /api/workflows/:id
 * @desc Soft-delete (archive) a workflow
 */
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    if (!canManage(workflow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    workflow.status = 'archived';
    await workflow.save();
    res.json({ workflow });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/workflows/:id/versions
 * @desc Save a new immutable draft version
 */
export const saveVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    if (!canManage(workflow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const { definition } = req.body as { definition?: WorkflowDefinition };
    if (!definition) return res.status(400).json({ error: 'Definition is required' });

    const validation = validateForDraft(definition);

    const version = new WorkflowVersion({
      workflow: workflow._id,
      version: workflow.latestVersion + 1,
      definition,
      createdBy: req.user!.id,
    });
    await version.save();

    workflow.latestVersion = version.version;
    await workflow.save();

    res.status(201).json({ version, warnings: validation.valid ? [] : validation.errors });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/workflows/:id/versions
 * @desc List versions of a workflow
 */
export const listVersions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    const versions = await WorkflowVersion.find({ workflow: workflow._id })
      .sort({ version: -1 })
      .select('version createdBy createdAt');
    res.json({ data: versions });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/workflows/:id/activate
 * @desc Activate a version (workflow_admin+; requires passing validation)
 */
export const activate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

    const { versionId } = req.body as { versionId?: string };
    if (!versionId) return res.status(400).json({ error: 'versionId is required' });

    const version = await WorkflowVersion.findById(versionId);
    if (!version || version.workflow.toString() !== workflow._id.toString()) {
      return res.status(404).json({ error: 'Version not found for this workflow' });
    }

    const validation = validateDefinition(version.definition as WorkflowDefinition);
    if (!validation.valid) {
      return res.status(422).json({ error: 'Validation failed', errors: validation.errors });
    }

    workflow.status = 'active';
    workflow.activeVersion = version.version;
    await workflow.save();

    res.json({ workflow });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/workflows/:id/pause
 * @desc Pause an active workflow (workflow_admin+)
 */
export const pause = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    if (workflow.status !== 'active') {
      return res.status(400).json({ error: 'Workflow is not active' });
    }
    workflow.status = 'draft';
    await workflow.save();
    res.json({ workflow });
  } catch (error) {
    next(error);
  }
};

export { MUTATE_ROLES, ACTIVATE_ROLES, canManage };
