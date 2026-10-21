import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Workflow from '../src/models/Workflow';
import WorkflowRun, { type RunStatus } from '../src/models/WorkflowRun';
import WorkflowNodeRun from '../src/models/WorkflowNodeRun';
import RunLog from '../src/models/RunLog';
import Settings from '../src/models/Settings';
import { runRetentionCleanup, recoverStalledRuns, startRetentionJob } from '../src/jobs/retention';

const DAY_MS = 24 * 60 * 60 * 1000;

let mongo: MongoMemoryServer;
let workflowId: string;
let ownerId: string;

/**
 * Backdates a document's timestamps through the native driver: Mongoose's
 * timestamps plugin would overwrite them on a normal save.
 */
async function backdate(model: mongoose.Model<any>, id: unknown, when: Date, opts: { updatedAt?: boolean } = {}) {
  const $set: Record<string, unknown> = { createdAt: when };
  if (opts.updatedAt !== false) $set.updatedAt = when;
  await model.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(id)) }, { $set });
}

interface SeededRun {
  runId: string;
  ageDays: number;
}

/** Seeds one run (plus its node run and log) backdated by `ageDays`. */
async function seedRun(
  opts: { ageDays: number; status?: RunStatus; withNodeRun?: boolean; withLog?: boolean }
): Promise<SeededRun> {
  const run = await WorkflowRun.create({
    workflow: workflowId,
    workflowVersion: 1,
    status: opts.status ?? 'succeeded',
    trigger: { type: 'manual', payload: {} },
    idempotencyKey: randomUUID(),
    createdBy: ownerId,
    startedAt: new Date(),
    finishedAt: new Date(),
  });

  if (opts.withNodeRun !== false) {
    const nodeRun = await WorkflowNodeRun.create({
      run: run._id,
      workflow: workflowId,
      nodeId: 'l1',
      kind: 'action.log',
      status: 'succeeded',
      inputSummary: '{"config":{"message":"hi"}}',
      outputSummary: '{"message":"Ada"}',
      startedAt: new Date(),
      finishedAt: new Date(),
      attempts: 1,
    });
    await backdate(WorkflowNodeRun, nodeRun._id, new Date(Date.now() - opts.ageDays * DAY_MS));
  }

  if (opts.withLog !== false) {
    const log = await RunLog.create({ run: run._id, lines: ['{"level":"info","message":"hi"}'] });
    await backdate(RunLog, log._id, new Date(Date.now() - opts.ageDays * DAY_MS), { updatedAt: false });
  }

  await backdate(WorkflowRun, run._id, new Date(Date.now() - opts.ageDays * DAY_MS));
  return { runId: String(run._id), ageDays: opts.ageDays };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ownerId = String(new mongoose.Types.ObjectId());
  const wf = await Workflow.create({
    name: 'Retention workflow',
    owner: ownerId,
    status: 'active',
    latestVersion: 1,
    activeVersion: 1,
  });
  workflowId = String(wf._id);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await WorkflowRun.deleteMany({});
  await WorkflowNodeRun.deleteMany({});
  await RunLog.deleteMany({});
  await Settings.deleteMany({});
});

describe('Retention cleanup job', () => {
  it('purges runs and logs older than retentionDays, keeping recent ones', async () => {
    const old = await seedRun({ ageDays: 60 });
    const recent = await seedRun({ ageDays: 1 });

    const result = await runRetentionCleanup({ now: new Date(), retentionDays: 30 });

    expect(result.runsDeleted).toBe(1);
    expect(await WorkflowRun.findById(old.runId)).toBeNull();
    expect(await RunLog.findOne({ run: old.runId })).toBeNull();

    expect(await WorkflowRun.findById(recent.runId)).not.toBeNull();
    expect(await RunLog.findOne({ run: recent.runId })).not.toBeNull();
  });

  it('keeps the node-run summary of a purged run but drops its payload snapshots', async () => {
    const old = await seedRun({ ageDays: 60 });

    await runRetentionCleanup({ now: new Date(), retentionDays: 30 });

    const nodeRun = await WorkflowNodeRun.findOne({ run: old.runId });
    expect(nodeRun).not.toBeNull();
    // Summary survives: node-level history and timings stay queryable.
    expect(nodeRun!.nodeId).toBe('l1');
    expect(nodeRun!.kind).toBe('action.log');
    expect(nodeRun!.status).toBe('succeeded');
    expect(nodeRun!.attempts).toBe(1);
    expect(nodeRun!.finishedAt).toBeDefined();
    // The bulky input/output snapshots do not.
    expect(nodeRun!.inputSummary ?? null).toBeNull();
    expect(nodeRun!.outputSummary ?? null).toBeNull();
  });

  it('leaves recent node-run payload snapshots untouched', async () => {
    const recent = await seedRun({ ageDays: 1 });

    await runRetentionCleanup({ now: new Date(), retentionDays: 30 });

    const nodeRun = await WorkflowNodeRun.findOne({ run: recent.runId });
    expect(nodeRun!.outputSummary).toContain('Ada');
  });

  it('never purges runs that are still live, however old', async () => {
    const running = await seedRun({ ageDays: 90, status: 'running' });
    const queued = await seedRun({ ageDays: 90, status: 'queued' });
    const waiting = await seedRun({ ageDays: 90, status: 'waiting' });

    await runRetentionCleanup({ now: new Date(), retentionDays: 30 });

    expect(await WorkflowRun.findById(running.runId)).not.toBeNull();
    expect(await WorkflowRun.findById(queued.runId)).not.toBeNull();
    expect(await WorkflowRun.findById(waiting.runId)).not.toBeNull();
  });

  it('reads retentionDays from system settings when no override is passed', async () => {
    await Settings.create({ key: 'retentionDays', value: 7 });
    const old = await seedRun({ ageDays: 10 });
    const recent = await seedRun({ ageDays: 2 });

    await runRetentionCleanup({ now: new Date() });

    expect(await WorkflowRun.findById(old.runId)).toBeNull();
    expect(await WorkflowRun.findById(recent.runId)).not.toBeNull();
  });

  it('is a no-op when retention is disabled (retentionDays <= 0)', async () => {
    const ancient = await seedRun({ ageDays: 3650 });

    const result = await runRetentionCleanup({ now: new Date(), retentionDays: 0 });

    expect(result.runsDeleted).toBe(0);
    expect(await WorkflowRun.findById(ancient.runId)).not.toBeNull();
  });
});

describe('Queue stall recovery', () => {
  it('requeues a run left running by a dead worker and fails its interrupted node runs', async () => {
    const stalled = await seedRun({ ageDays: 0, status: 'running', withNodeRun: false, withLog: false });
    const interrupted = await WorkflowNodeRun.create({
      run: stalled.runId,
      workflow: workflowId,
      nodeId: 'l1',
      kind: 'action.log',
      status: 'running',
      startedAt: new Date(),
      attempts: 1,
    });
    await backdate(WorkflowRun, stalled.runId, new Date(Date.now() - 2 * 60 * 60 * 1000));
    await backdate(WorkflowNodeRun, interrupted._id, new Date(Date.now() - 2 * 60 * 60 * 1000));

    const result = await recoverStalledRuns({ now: new Date(), stallTimeoutMinutes: 30 });

    expect(result.runsRequeued).toBe(1);
    const run = await WorkflowRun.findById(stalled.runId);
    // Requeued for a resume pass — never reported as a success it did not reach.
    expect(run!.status).toBe('queued');
    expect(run!.status).not.toBe('succeeded');

    const nodeRun = await WorkflowNodeRun.findOne({ run: stalled.runId });
    expect(nodeRun!.status).toBe('failed');
    expect(nodeRun!.error?.code).toBe('STALLED_WORKER');
  });

  it('leaves a run whose heartbeat is fresh alone', async () => {
    const live = await seedRun({ ageDays: 0, status: 'running', withNodeRun: false, withLog: false });
    await WorkflowRun.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(live.runId) },
      { $set: { heartbeatAt: new Date(), updatedAt: new Date() } }
    );

    const result = await recoverStalledRuns({ now: new Date(), stallTimeoutMinutes: 30 });

    expect(result.runsRequeued).toBe(0);
    expect((await WorkflowRun.findById(live.runId))!.status).toBe('running');
  });

  it('never touches finished runs', async () => {
    const succeeded = await seedRun({ ageDays: 5, status: 'succeeded' });
    const failed = await seedRun({ ageDays: 5, status: 'failed' });

    const result = await recoverStalledRuns({ now: new Date(), stallTimeoutMinutes: 30 });

    expect(result.runsRequeued).toBe(0);
    expect((await WorkflowRun.findById(succeeded.runId))!.status).toBe('succeeded');
    expect((await WorkflowRun.findById(failed.runId))!.status).toBe('failed');
  });

  it('reads the stall timeout from system settings when no override is passed', async () => {
    await Settings.create({ key: 'queueStallTimeoutMinutes', value: 5 });
    const stalled = await seedRun({ ageDays: 0, status: 'running', withNodeRun: false, withLog: false });
    await backdate(WorkflowRun, stalled.runId, new Date(Date.now() - 10 * 60 * 1000));

    const result = await recoverStalledRuns({ now: new Date() });

    expect(result.runsRequeued).toBe(1);
    expect((await WorkflowRun.findById(stalled.runId))!.status).toBe('queued');
  });
});

describe('Retention job scheduling', () => {
  it('degrades gracefully without Redis', async () => {
    // The suite runs with REDIS_URL unset (tests/setup.ts): the job reports
    // itself disabled rather than throwing at startup.
    expect(await startRetentionJob()).toBeNull();
  });
});
