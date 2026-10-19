import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Workflow, { IWorkflow } from '../models/Workflow';
import WorkflowVersion from '../models/WorkflowVersion';
import WorkflowRun from '../models/WorkflowRun';
import { validateDefinition } from '../services/workflow-validator.service';
import { enqueueRun } from '../queues';
import { logAudit } from '../services/audit.service';
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
    // Includes each version's definition so the editor can load the latest one.
    const versions = await WorkflowVersion.find({ workflow: workflow._id }).sort({ version: -1 });
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

/**
 * @route POST /api/workflows/:id/execute
 * @desc Manual trigger: create a queued run and enqueue it (owner or admin+)
 */
export const execute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    if (!canManage(workflow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    if (workflow.status !== 'active' || workflow.activeVersion == null) {
      return res.status(409).json({ error: 'Workflow is not active' });
    }

    const { payload } = (req.body ?? {}) as { payload?: unknown };
    const run = new WorkflowRun({
      workflow: workflow._id,
      workflowVersion: workflow.activeVersion,
      status: 'queued',
      trigger: { type: 'manual', payload: payload ?? {} },
      idempotencyKey: randomUUID(),
      createdBy: req.user!.id,
    });
    await run.save();

    await logAudit(req.user!.id, 'EXECUTE_WORKFLOW', 'Workflow', workflow._id, {
      runId: String(run._id),
    });
    // Without Redis this is a no-op and the run stays queued (worker picks it up).
    await enqueueRun(String(run._id));

    res.status(202).json({ run });
  } catch (error) {
    next(error);
  }
};

export { MUTATE_ROLES, ACTIVATE_ROLES, canManage };

/**
 * @route GET /api/workflows/:id/versions/:version1/diff/:version2
 * @desc Get diff between two versions of a workflow
 */
export const diff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

    // Check permissions: only owner or admin+ can view diff? We'll allow same as view.
    // For simplicity, we'll allow any authenticated user (since versions are part of workflow).
    // But we should check canManage? Actually, viewing a workflow is allowed via getOne which only requires auth.
    // We'll just require auth.
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const v1 = parseInt(req.params.version1);
    const v2 = parseInt(req.params.version2);
    if (isNaN(v1) || isNaN(v2) || v1 <= 0 || v2 <= 0) {
      return res.status(400).json({ error: 'Invalid version numbers' });
    }

    const [version1Doc, version2Doc] = await Promise.all([
      WorkflowVersion.findOne({ workflow: workflow._id, version: v1 }),
      WorkflowVersion.findOne({ workflow: workflow._id, version: v2 })
    ]);

    if (!version1Doc || !version2Doc) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }

    // Compute diff - for simplicity, we'll return whether they are equal and the differing fields
    const def1 = version1Doc.definition as WorkflowDefinition;
    const def2 = version2Doc.definition as WorkflowDefinition;

    const equal = JSON.stringify(def1) === JSON.stringify(def2);
    let diffResult: any = { equal };
    if (!equal) {
      // Simple diff: changed nodes and edges
      const nodes1 = def1.nodes ?? [];
      const nodes2 = def2.nodes ?? [];
      const edges1 = def1.edges ?? [];
      const edges2 = def2.edges ?? [];

      // We'll just return the two definitions for now; in a real implementation we'd compute a proper diff.
      diffResult = {
        equal,
        definitionV1: def1,
        definitionV2: def2,
      };
    }

    res.json({ diff: diffResult });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/workflows/:id/versions/:version/restore
 * @desc Restore a version as a new draft version
 */
export const restore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check permissions: only admin+ or owner can restore? We'll require same as mutating.
    if (!canManage(workflow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const targetVersion = parseInt(req.params.version);
    if (isNaN(targetVersion) || targetVersion <= 0) {
      return res.status(400).json({ error: 'Invalid version number' });
    }

    const targetVersionDoc = await WorkflowVersion.findOne({ workflow: workflow._id, version: targetVersion });
    if (!targetVersionDoc) {
      return res.status(404).json({ error: 'Target version not found' });
    }

    // Create a new draft version as a copy of the target version
    const newVersionNumber = workflow.latestVersion + 1;
    const newVersion = new WorkflowVersion({
      workflow: workflow._id,
      version: newVersionNumber,
      definition: targetVersionDoc.definition,
      createdBy: req.user!.id,
    });
    await newVersion.save();

    // Update workflow's latestVersion
    workflow.latestVersion = newVersionNumber;
    await workflow.save();

    res.status(201).json({ version: newVersion });
  } catch (error) {
    next(error);
  }
};
