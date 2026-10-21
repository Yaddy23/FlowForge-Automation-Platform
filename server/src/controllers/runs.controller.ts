import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import WorkflowRun, { IWorkflowRun } from '../models/WorkflowRun';
import WorkflowNodeRun from '../models/WorkflowNodeRun';
import RunLog from '../models/RunLog';
import Workflow from '../models/Workflow';
import { redact } from '../workflow-engine/redact';
import { enqueueRun, getRunQueue } from '../queues';
import { logAudit } from '../services/audit.service';
import { canManage } from './workflow.controller';

/**
 * Execution history API (Task 11). Run docs carry server-only fields that must
 * never leave the API: `nodeOutputs` (resume context), `heartbeatAt` (stall
 * recovery liveness, Task 19) and the raw `trigger.payload` (redacted here).
 */
function serializeRun(run: IWorkflowRun & mongoose.Document): Record<string, unknown> {
  const plain = JSON.parse(JSON.stringify(run.toJSON())) as Record<string, unknown>;
  delete plain.nodeOutputs;
  delete plain.heartbeatAt;
  const trigger = plain.trigger as { type?: unknown; payload?: unknown } | undefined;
  if (trigger) {
    plain.trigger = { ...trigger, payload: redact(trigger.payload) };
  }
  return plain;
}

/**
 * @route GET /api/runs
 * @desc List runs: filters workflowId, status, trigger, from/to (createdAt), pagination
 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const filter: Record<string, unknown> = {};
    if (req.query.workflowId) filter.workflow = req.query.workflowId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.trigger) filter['trigger.type'] = req.query.trigger;
    if (req.query.from || req.query.to) {
      filter.createdAt = {
        ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}),
        ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      WorkflowRun.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('workflow', 'name'),
      WorkflowRun.countDocuments(filter),
    ]);

    res.json({ data: data.map(serializeRun), page, limit, total });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/runs/:id
 * @desc Run detail with its node-run timeline
 */
export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await WorkflowRun.findById(req.params.id).populate('workflow', 'name');
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const nodeRuns = await WorkflowNodeRun.find({ run: run._id }).sort({ startedAt: 1, createdAt: 1 });
    res.json({ run: serializeRun(run), nodeRuns });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/runs/:id/retry
 * @desc Re-execute a failed/timed_out run: re-queues it; the engine skips
 *       succeeded nodes and re-runs the failed one with a fresh attempts count.
 */
export const retry = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await WorkflowRun.findById(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const workflow = await Workflow.findById(run.workflow);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    if (!canManage(workflow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    if (run.status !== 'failed' && run.status !== 'timed_out') {
      return res.status(409).json({ error: `Run is ${run.status} — only failed or timed_out runs can be retried` });
    }

    run.status = 'queued';
    run.error = null;
    run.finishedAt = undefined;
    await run.save();

    await logAudit(req.user!.id, 'RETRY_RUN', 'WorkflowRun', run._id, {});
    await enqueueRun(String(run._id));
    res.status(202).json({ run: serializeRun(run) });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/runs/:id/cancel
 * @desc Cancel a queued/running/waiting run. The in-flight engine detects the
 *       status change between nodes and aborts without overwriting it.
 */
export const cancel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await WorkflowRun.findById(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const workflow = await Workflow.findById(run.workflow);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    if (!canManage(workflow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    if (run.status !== 'queued' && run.status !== 'running' && run.status !== 'waiting') {
      return res.status(409).json({ error: `Run is ${run.status} — it can no longer be cancelled` });
    }

    run.status = 'cancelled';
    run.error = { code: 'CANCELLED', message: 'Run cancelled by user' };
    run.finishedAt = new Date();
    await run.save();

    // Best-effort: drop the pending queue job (no-op without Redis).
    const queue = getRunQueue();
    if (queue) {
      await queue.remove(`run:${String(run._id)}`).catch(() => undefined);
    }

    await logAudit(req.user!.id, 'CANCEL_RUN', 'WorkflowRun', run._id, {});
    res.json({ run: serializeRun(run) });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/runs/:id/logs
 * @desc Download the run's redacted NDJSON execution log
 */
export const logs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runLog = await RunLog.findOne({ run: req.params.id });
    if (!runLog) return res.status(404).json({ error: 'No logs for this run' });
    res.type('application/x-ndjson').send(runLog.lines.join('\n'));
  } catch (error) {
    next(error);
  }
};
