import WorkflowRun from '../models/WorkflowRun';
import { executeRun } from '../workflow-engine/engine';

/**
 * Redis-free run worker: polls MongoDB for `queued` runs and executes them
 * in-process. Opt-in via `RUN_POLLING_WORKER=true`.
 *
 * This exists so the platform is usable without Redis — local development,
 * single-service deploys, and the Playwright E2E stack. It is a deliberately
 * degraded mode: one run at a time per process, no BullMQ retry/backoff, and no
 * cross-process coordination (two polling processes could both pick up the same
 * run). Use `startRunWorker()` whenever Redis is available.
 *
 * Runs left `waiting` by `action.delay` are not resumed: their resume time lives
 * on the delayed BullMQ job, which this mode has no queue for.
 */

export interface PollingWorker {
  stop(): Promise<void>;
}

export function startPollingWorker(opts: { intervalMs?: number } = {}): PollingWorker {
  const intervalMs = opts.intervalMs ?? 500;
  let executing = false;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (executing || stopped) return;
    executing = true;
    try {
      // Oldest queued run first, so a backlog drains in submission order.
      const next = await WorkflowRun.findOne({ status: 'queued' })
        .sort({ createdAt: 1 })
        .select('_id')
        .lean();
      if (next) await executeRun(String(next._id));
    } catch (err) {
      // executeRun leaves the run queued when it throws (concurrency limit), so
      // the next tick retries it; anything else is logged and moved past.
      console.error(`[polling-worker] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      executing = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);

  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
