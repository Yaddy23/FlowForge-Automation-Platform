import { Queue, Worker } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { executeRun } from '../workflow-engine/engine';

/**
 * BullMQ queues for the execution engine. Everything degrades gracefully when
 * REDIS_URL is unset or unreachable (test/dev without Redis): accessors return
 * null and enqueue is a logged no-op — runs stay `queued` until a worker with
 * a live Redis processes them.
 *
 * Concurrency: global worker concurrency via env; per-workflow concurrency is
 * enforced inside executeRun (WORKFLOW_CONCURRENCY_LIMIT, retryable throw).
 */

let connection: Redis | null = null;
let warnedNoRedis = false;
let runQueue: Queue | null = null;
let eventsQueue: Queue | null = null;

function getConnection(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (!warnedNoRedis) {
      warnedNoRedis = true;
      console.warn('[queues] REDIS_URL not set — BullMQ queues disabled, runs stay queued');
    }
    return null;
  }
  if (!connection) {
    // BullMQ requires maxRetriesPerRequest: null on the shared connection.
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

export const RUN_QUEUE_NAME = 'workflow-runs';
export const EVENTS_QUEUE_NAME = 'workflow-events';

export function getRunQueue(): Queue | null {
  const conn = getConnection();
  if (!conn) return null;
  if (!runQueue) {
    runQueue = new Queue(RUN_QUEUE_NAME, { connection: conn });
  }
  return runQueue;
}

/** Event-trigger fan-out queue (consumed in Task 14). */
export function getEventsQueue(): Queue | null {
  const conn = getConnection();
  if (!conn) return null;
  if (!eventsQueue) {
    eventsQueue = new Queue(EVENTS_QUEUE_NAME, { connection: conn });
  }
  return eventsQueue;
}

/**
 * Enqueues a run for execution. `opts.delayMs` schedules a delayed
 * continuation (action.delay resume). No-op (warning) without Redis — the run
 * doc remains `queued`/`waiting` and is picked up by any later worker.
 */
export async function enqueueRun(runId: string, opts?: { delayMs?: number }): Promise<void> {
  const queue = getRunQueue();
  if (!queue) return;
  await queue.add(
    'run',
    { runId },
    {
      jobId: opts?.delayMs ? `run:${runId}:${Date.now()}` : `run:${runId}`,
      delay: opts?.delayMs,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    }
  );
}

/** Starts the run worker; returns null when Redis is unavailable. */
export async function startRunWorker(): Promise<Worker | null> {
  const conn = getConnection();
  if (!conn) return null;
  const concurrency = parseInt(process.env.RUN_WORKER_CONCURRENCY ?? '5', 10) || 5;
  const worker = new Worker(
    RUN_QUEUE_NAME,
    async (job) => {
      await executeRun(job.data.runId as string);
    },
    { connection: conn, concurrency }
  );
  worker.on('failed', (job, err) => {
    console.error(`[queues] run job ${job?.id ?? '?'} failed: ${err.message}`);
  });
  return worker;
}

export async function closeQueues(): Promise<void> {
  await runQueue?.close();
  await eventsQueue?.close();
  runQueue = null;
  eventsQueue = null;
  if (connection) {
    await connection.quit().catch(() => connection?.disconnect());
    connection = null;
  }
}
