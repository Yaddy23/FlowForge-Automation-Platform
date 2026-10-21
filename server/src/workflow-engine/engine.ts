import Workflow from '../models/Workflow';
import WorkflowVersion from '../models/WorkflowVersion';
import WorkflowRun from '../models/WorkflowRun';
import WorkflowNodeRun from '../models/WorkflowNodeRun';
import { getNodeSpec } from '../registry/node-registry';
import { getActionHandler } from '../actions/registry';
import { registerAllActions } from '../actions';
import { enqueueRun } from '../queues';
import { registerConditionHandler } from './handlers/condition';
import { registerBranchHandler } from './handlers/branch';
import { createLogger, type RunContext } from './context';
import { summarize } from './redact';
import { resolveTemplatesDeep, type TemplateScope } from './template';
import RunLog from '../models/RunLog';
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from 'shared/types/workflow';

registerAllActions();
registerConditionHandler();
registerBranchHandler();

class TimeoutError extends Error {
  code = 'TIMEOUT';
  constructor(message = 'Node execution exceeded the run deadline') {
    super(message);
  }
}

class NodeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, remainingMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (remainingMs <= 0) {
      reject(new TimeoutError());
      return;
    }
    const timer = setTimeout(() => reject(new TimeoutError()), remainingMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Retry policy from node config: `retry: { attempts, backoffMs }`, attempts ≥ 1. */
function retryPolicyOf(config: Record<string, unknown> | undefined): { attempts: number; backoffMs: number } {
  const retry = (config ?? {}).retry as { attempts?: unknown; backoffMs?: unknown } | undefined;
  const attempts = Math.max(1, Math.floor(Number(retry?.attempts ?? 1)) || 1);
  const backoffMs = Math.max(0, Number(retry?.backoffMs ?? 100) || 0);
  return { attempts, backoffMs };
}

async function executeHandler(
  kind: string,
  category: string,
  config: Record<string, unknown>,
  ctx: RunContext
): Promise<{ output: Record<string, unknown> }> {
  if (category === 'trigger') {
    return { output: { payload: ctx.triggerPayload } };
  }
  const handler = getActionHandler(kind);
  if (!handler) {
    throw new NodeError('NOT_IMPLEMENTED', `No handler registered for node kind "${kind}"`);
  }
  return handler(config, ctx);
}

interface NodeOutcome {
  status: 'succeeded' | 'failed';
  timedOut: boolean;
  /** Set when the node paused the run (action.delay): resume after this many ms. */
  delayMs?: number;
}

/**
 * Executes one node with its retry policy against the run deadline.
 * Persists the WorkflowNodeRun record (attempts, summaries, error) either way.
 */
async function runNode(
  node: WorkflowNode,
  category: string,
  scope: TemplateScope,
  ctx: RunContext,
  deadline: number
): Promise<NodeOutcome> {
  const startedAt = new Date();
  const nodeRun = await WorkflowNodeRun.create({
    run: ctx.run._id,
    workflow: ctx.workflow._id,
    nodeId: node.id,
    kind: node.type,
    status: 'running',
    inputSummary: summarize({ config: node.config, payload: ctx.triggerPayload }),
    startedAt,
    attempts: 0,
  });

  const { attempts: maxAttempts, backoffMs } = retryPolicyOf(node.config);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    nodeRun.attempts = attempt;
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new TimeoutError();
      // Templates resolve per attempt against the live context.
      const config = resolveTemplatesDeep(node.config ?? {}, scope) as Record<string, unknown>;
      const { output } = await withTimeout(executeHandler(node.type, category, config, ctx), remaining);
      ctx.nodeOutputs[node.id] = output;
      nodeRun.status = 'succeeded';
      nodeRun.outputSummary = summarize(output);
      nodeRun.finishedAt = new Date();
      await nodeRun.save();
      // action.delay marker: the run pauses here and resumes via a delayed job.
      const delayedForMs = (output as { delayedForMs?: unknown }).delayedForMs;
      const delayMs =
        typeof delayedForMs === 'number' && Number.isFinite(delayedForMs) && delayedForMs > 0
          ? Math.floor(delayedForMs)
          : undefined;
      return { status: 'succeeded', timedOut: false, ...(delayMs ? { delayMs } : {}) };
    } catch (err) {
      lastError = err;
      if (err instanceof TimeoutError) break; // no retry past the deadline
      if (attempt < maxAttempts) await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }

  const timedOut = lastError instanceof TimeoutError;
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  // ConditionError/NodeError carry their own codes; other errors are generic.
  const code =
    timedOut && !(lastError instanceof NodeError)
      ? 'TIMEOUT'
      : typeof (lastError as { code?: unknown } | null)?.code === 'string'
        ? ((lastError as { code: string }).code)
        : 'NODE_ERROR';
  nodeRun.status = 'failed';
  nodeRun.error = { code, message };
  nodeRun.finishedAt = new Date();
  await nodeRun.save();
  ctx.logger.error(`Node ${node.id} (${node.type}) failed`, { code, message, attempts: nodeRun.attempts });
  return { status: 'failed', timedOut };
}

/**
 * Routing (Task 9): decides which outgoing edges a node's walk follows.
 * - `condition` node: sourceHandle 'true' follows on pass, 'false' on fail,
 *   any other/absent handle follows unconditionally.
 * - `branch` node: sourceHandle equal to the selected branch id (a matched
 *   branch or the fallback) follows; other handles do not; absent handles do.
 * - everything else follows all outgoing edges (T8 behavior).
 */
function selectOutgoingEdges(
  node: WorkflowNode,
  category: string,
  edges: WorkflowEdge[],
  ctx: RunContext
): string[] {
  const outgoing = edges.filter((e) => e.source === node.id);
  const output = (ctx.nodeOutputs[node.id] ?? {}) as { passed?: boolean; branchId?: string | null };

  if (category === 'condition') {
    return outgoing
      .filter((e) => {
        if (e.sourceHandle === 'true') return output.passed === true;
        if (e.sourceHandle === 'false') return output.passed !== true;
        return true;
      })
      .map((e) => e.target);
  }

  if (category === 'logic') {
    return outgoing
      .filter((e) => {
        if (e.sourceHandle === undefined || e.sourceHandle === 'out') return true;
        return e.sourceHandle === output.branchId;
      })
      .map((e) => e.target);
  }

  return outgoing.map((e) => e.target);
}

/**
 * Executes a run end-to-end: loads run + workflow + version, walks the
 * definition from its trigger node (BFS, cycle-safe), executing each node and
 * persisting a node-run record. Failure/timeout of any node ends the run.
 *
 * Throws (leaving the run `queued`) when the workflow is at its concurrency
 * limit — the queue layer retries the job with backoff.
 */
export async function executeRun(runId: string): Promise<void> {
  const run = await WorkflowRun.findById(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  // Only queued (and resumed `waiting`) runs execute; cancelled/finished runs are terminal.
  if (run.status !== 'queued' && run.status !== 'waiting') return;

  const concurrencyLimit = parseInt(process.env.WORKFLOW_CONCURRENCY_LIMIT ?? '5', 10) || 5;
  const runningCount = await WorkflowRun.countDocuments({
    workflow: run.workflow,
    status: 'running',
    _id: { $ne: run._id },
  });
  if (runningCount >= concurrencyLimit) {
    // BullMQ job retry handles backoff; the run stays queued.
    throw new Error('WORKFLOW_CONCURRENCY_LIMIT');
  }

  const workflow = await Workflow.findById(run.workflow);
  if (!workflow) {
    run.status = 'failed';
    run.error = { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow no longer exists' };
    run.finishedAt = new Date();
    await run.save();
    return;
  }

  const version = await WorkflowVersion.findOne({ workflow: workflow._id, version: run.workflowVersion });
  if (!version) {
    run.status = 'failed';
    run.error = { code: 'VERSION_NOT_FOUND', message: `Version ${run.workflowVersion} not found` };
    run.finishedAt = new Date();
    await run.save();
    return;
  }

  const definition = version.definition as WorkflowDefinition;
  const nodesById = new Map(definition.nodes.map((n) => [n.id, n]));
  const triggerNode = definition.nodes.find((n) => getNodeSpec(n.type)?.category === 'trigger');
  if (!triggerNode) {
    run.status = 'failed';
    run.error = { code: 'NO_TRIGGER', message: 'Definition has no trigger node' };
    run.finishedAt = new Date();
    await run.save();
    return;
  }

  run.status = 'running';
  if (!run.startedAt) run.startedAt = new Date();
  run.heartbeatAt = new Date();
  await run.save();

  const logger = createLogger(String(run._id));
  // Restored when present: delay-resume and retry both continue an earlier
  // walk — fresh runs simply restore an empty object.
  const ctx: RunContext = {
    workflow,
    version: { version: version.version, definition },
    run,
    payload: run.trigger?.payload ?? {},
    triggerPayload: run.trigger?.payload ?? {},
    vars: {},
    nodeOutputs: { ...(run.nodeOutputs ?? {}) },
    logger,
  };
  const scope: TemplateScope = {
    payload: ctx.payload,
    get vars() {
      return ctx.vars;
    },
    get outputs() {
      return ctx.nodeOutputs;
    },
  };

  const timeoutMs = run.timeoutMs ?? (parseInt(process.env.RUN_TIMEOUT_MS ?? '300000', 10) || 300000);
  const deadline = Date.now() + timeoutMs;

  // BFS walk from the trigger, cycle-safe via visited set (the validator
  // permits cycles that pass through branch nodes — Task 9 routes them).
  const queue: string[] = [triggerNode.id];
  const visited = new Set<string>();
  let failure: { code: string; message: string } | null = null;
  let delayed: { delayMs: number } | null = null;

  // A cancelled run aborts the walk; the cancel API owns the status/finishedAt
  // write, so detection here simply returns without saving.
  const isCancelled = async (): Promise<boolean> => {
    const fresh = await WorkflowRun.findById(run._id).select('status').lean();
    return fresh?.status === 'cancelled';
  };

  // Previously succeeded nodes are NOT re-executed (delay-resume and retry
  // both continue an earlier walk): they are marked visited and their
  // outgoing edges re-routed from the restored outputs.
  const completed = await WorkflowNodeRun.find({ run: run._id, status: 'succeeded' })
    .select('nodeId')
    .lean();
  for (const completedRun of completed) {
    const completedId = String(completedRun.nodeId);
    visited.add(completedId);
    const completedNode = nodesById.get(completedId);
    if (!completedNode) continue;
    const completedSpec = getNodeSpec(completedNode.type);
    const completedCategory =
      completedSpec?.category ?? (getActionHandler(completedNode.type) ? 'action' : undefined);
    if (!completedCategory) continue;
    for (const target of selectOutgoingEdges(completedNode, completedCategory, definition.edges, ctx)) {
      queue.push(target);
    }
  }

  while (queue.length > 0) {
    if (await isCancelled()) return;
    const nodeId = queue.shift() as string;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    // Heartbeat per node: stall recovery (jobs/retention.ts) only requeues a
    // `running` run whose worker stopped reporting progress.
    await WorkflowRun.updateOne({ _id: run._id }, { $set: { heartbeatAt: new Date() } });

    const node = nodesById.get(nodeId);
    if (!node) {
      failure = { code: 'UNKNOWN_NODE', message: `Node "${nodeId}" is not in the definition` };
      break;
    }

    const spec = getNodeSpec(node.type);
    // A kind outside the static registry is still executable when an action
    // handler is registered for it; only unknown-and-unhandled kinds fail.
    const category = spec?.category ?? (getActionHandler(node.type) ? 'action' : undefined);
    if (!category) {
      await WorkflowNodeRun.create({
        run: run._id,
        workflow: workflow._id,
        nodeId: node.id,
        kind: node.type,
        status: 'failed',
        error: { code: 'UNKNOWN_NODE', message: `Unknown node type "${node.type}"` },
        attempts: 0,
        startedAt: new Date(),
        finishedAt: new Date(),
      });
      failure = { code: 'UNKNOWN_NODE', message: `Unknown node type "${node.type}"` };
      break;
    }

    const outcome = await runNode(node, category, scope, ctx, deadline);
    if (outcome.delayMs) {
      delayed = { delayMs: outcome.delayMs };
      break;
    }
    if (outcome.timedOut) {
      failure = { code: 'TIMEOUT', message: 'Run exceeded its time limit' };
      break;
    }
    if (outcome.status === 'failed') {
      const failedRun = await WorkflowNodeRun.findOne({ run: run._id, nodeId: node.id });
      failure = failedRun?.error ?? { code: 'NODE_ERROR', message: `Node ${node.id} failed` };
      break;
    }
    for (const edge of selectOutgoingEdges(node, category, definition.edges, ctx)) {
      queue.push(edge);
    }
  }

  if (delayed) {
    if (await isCancelled()) return;
    // Paused by action.delay: persist the outputs for the resume pass and
    // schedule the continuation job. The run is not finished — no finishedAt.
    run.status = 'waiting';
    run.nodeOutputs = ctx.nodeOutputs;
    await run.save();
    await enqueueRun(String(run._id), { delayMs: delayed.delayMs });
    await persistRunLog(String(run._id), logger);
    return;
  }

  if (await isCancelled()) return;

  run.finishedAt = new Date();
  if (failure) {
    run.status = failure.code === 'TIMEOUT' ? 'timed_out' : 'failed';
    run.error = failure;
    // Persist outputs so a retry restores upstream context without re-running
    // the succeeded prefix.
    run.nodeOutputs = ctx.nodeOutputs;
  } else {
    run.status = 'succeeded';
    run.error = null;
  }
  await run.save();
  await persistRunLog(String(run._id), logger);
}

/** Appends this pass's redacted log lines to the run's NDJSON log (Task 11). */
async function persistRunLog(runId: string, logger: ReturnType<typeof createLogger>): Promise<void> {
  if (logger.lines.length === 0) return;
  await RunLog.findOneAndUpdate({ run: runId }, { $push: { lines: { $each: logger.lines } } }, { upsert: true });
}
