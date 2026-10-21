import { Queue, Worker } from 'bullmq';
import WorkflowRun from '../models/WorkflowRun';
import WorkflowNodeRun from '../models/WorkflowNodeRun';
import RunLog from '../models/RunLog';
import { enqueueRun, getConnection } from '../queues';
import { getSetting } from '../services/settings.service';

/**
 * Retention cleanup + queue stall recovery (Task 19).
 *
 * Two sweeps share one repeatable BullMQ job:
 *  1. `runRetentionCleanup` purges execution history past the configurable
 *     `retentionDays` window.
 *  2. `recoverStalledRuns` puts runs abandoned by a dead worker back on the
 *     queue so BullMQ's stalled-job handling can re-deliver them.
 *
 * Both read their thresholds from system settings (Task 17) and are callable
 * directly — the test suite and any admin tooling can run them on demand.
 */

export const RETENTION_QUEUE_NAME = 'retention';
export const RETENTION_JOB_NAME = 'retention-cleanup';
/** Daily sweep: retention is measured in days, so sub-daily runs buy nothing. */
export const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_STALL_TIMEOUT_MINUTES = 30;

/** Runs are purgeable only once they can no longer change state. */
const TERMINAL_STATUSES = ['succeeded', 'failed', 'cancelled', 'timed_out'] as const;

export interface RetentionResult {
  runsDeleted: number;
  logsDeleted: number;
  nodeRunsTrimmed: number;
}

export interface StallRecoveryResult {
  runsRequeued: number;
  nodeRunsFailed: number;
}

/** Settings are stored as Mixed — coerce, and fall back when unusable. */
function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Deletes runs (and their logs) older than the retention window, keeping the
 * node-run summary rows: node-level history, statuses and timings stay
 * queryable forever, while the bulky input/output snapshots are dropped.
 *
 * Live runs (`queued`/`running`/`waiting`) are never purged, however old —
 * deleting them would strand work in flight. `retentionDays <= 0` disables
 * the sweep entirely.
 */
export async function runRetentionCleanup(
  opts: { now?: Date; retentionDays?: number } = {}
): Promise<RetentionResult> {
  const now = opts.now ?? new Date();
  const configured = opts.retentionDays ?? (await getSetting<number>('retentionDays', DEFAULT_RETENTION_DAYS));
  const retentionDays = numberOr(configured, DEFAULT_RETENTION_DAYS);

  if (retentionDays <= 0) {
    return { runsDeleted: 0, logsDeleted: 0, nodeRunsTrimmed: 0 };
  }

  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const expired = await WorkflowRun.find({
    status: { $in: TERMINAL_STATUSES },
    createdAt: { $lt: cutoff },
  })
    .select('_id')
    .lean();

  if (expired.length === 0) {
    return { runsDeleted: 0, logsDeleted: 0, nodeRunsTrimmed: 0 };
  }
  const expiredIds = expired.map((run) => run._id);

  const trimmed = await WorkflowNodeRun.updateMany(
    { run: { $in: expiredIds } },
    { $unset: { inputSummary: '', outputSummary: '' } }
  );
  const logs = await RunLog.deleteMany({ run: { $in: expiredIds } });
  const runs = await WorkflowRun.deleteMany({ _id: { $in: expiredIds } });

  return {
    runsDeleted: runs.deletedCount ?? 0,
    logsDeleted: logs.deletedCount ?? 0,
    nodeRunsTrimmed: trimmed.modifiedCount ?? 0,
  };
}

/**
 * Recovers runs whose worker died mid-flight. Such a run is left `running`
 * with a stale heartbeat, and `executeRun` deliberately ignores anything that
 * is not `queued`/`waiting` — so without this sweep it would sit `running`
 * forever and never be reported as anything.
 *
 * Recovery requeues it (never marks it succeeded): the engine resumes from the
 * node runs that did complete and re-executes the rest. Without Redis the
 * re-enqueue is a no-op, which leaves the run visibly `queued` rather than
 * silently wrong.
 *
 * Only `running` runs are recovered. A `waiting` run (action.delay) is excluded
 * deliberately: its resume time lives on the delayed BullMQ job, not on the run,
 * so there is no way to tell an overdue resume from one that is still legitimately
 * pending.
 */
export async function recoverStalledRuns(
  opts: { now?: Date; stallTimeoutMinutes?: number } = {}
): Promise<StallRecoveryResult> {
  const now = opts.now ?? new Date();
  const configured =
    opts.stallTimeoutMinutes ?? (await getSetting<number>('queueStallTimeoutMinutes', DEFAULT_STALL_TIMEOUT_MINUTES));
  const timeoutMinutes = Math.max(1, numberOr(configured, DEFAULT_STALL_TIMEOUT_MINUTES));
  const cutoff = new Date(now.getTime() - timeoutMinutes * 60_000);

  const stalled = await WorkflowRun.find({
    status: 'running',
    $or: [
      { heartbeatAt: { $lt: cutoff } },
      // Runs that started before the heartbeat field existed fall back to
      // updatedAt, which the engine still bumps at each status transition.
      { heartbeatAt: null, updatedAt: { $lt: cutoff } },
    ],
  })
    .select('_id')
    .lean();

  if (stalled.length === 0) {
    return { runsRequeued: 0, nodeRunsFailed: 0 };
  }
  const stalledIds = stalled.map((run) => run._id);

  // Nodes interrupted mid-flight are failed rather than left `running`: the
  // resume pass re-executes every node that is not `succeeded`, and a stale
  // `running` row would otherwise linger as a phantom forever.
  const nodeRuns = await WorkflowNodeRun.updateMany(
    { run: { $in: stalledIds }, status: 'running' },
    {
      $set: {
        status: 'failed',
        error: {
          code: 'STALLED_WORKER',
          message: 'Worker stopped mid-run; the run was requeued by stall recovery',
        },
        finishedAt: now,
      },
    }
  );

  await WorkflowRun.updateMany(
    { _id: { $in: stalledIds } },
    { $set: { status: 'queued', error: null, finishedAt: null } }
  );

  for (const id of stalledIds) {
    await enqueueRun(String(id));
  }

  return { runsRequeued: stalledIds.length, nodeRunsFailed: nodeRuns.modifiedCount ?? 0 };
}

export interface RetentionJob {
  stop(): Promise<void>;
}

/**
 * Registers the repeatable cleanup job and the worker that consumes it.
 * Returns null (with a warning) when Redis is unavailable — the API keeps
 * serving, only the periodic sweep is disabled.
 */
export async function startRetentionJob(): Promise<RetentionJob | null> {
  const connection = getConnection();
  if (!connection) {
    console.warn('[retention] REDIS_URL not set — retention cleanup job disabled');
    return null;
  }

  const queue = new Queue(RETENTION_QUEUE_NAME, { connection });
  const worker = new Worker(
    RETENTION_QUEUE_NAME,
    async () => {
      const retention = await runRetentionCleanup();
      const recovery = await recoverStalledRuns();
      console.log(
        `[retention] purged ${retention.runsDeleted} runs / ${retention.logsDeleted} logs, ` +
          `trimmed ${retention.nodeRunsTrimmed} node runs; requeued ${recovery.runsRequeued} stalled runs`
      );
    },
    { connection }
  );
  worker.on('failed', (job, err) => {
    console.error(`[retention] job ${job?.id ?? '?'} failed: ${err.message}`);
  });

  // Repeatable ticks live on the queue — a Worker only consumes.
  await queue.add(
    RETENTION_JOB_NAME,
    { type: RETENTION_JOB_NAME },
    { repeat: { every: RETENTION_INTERVAL_MS }, jobId: RETENTION_JOB_NAME }
  );

  return {
    stop: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
