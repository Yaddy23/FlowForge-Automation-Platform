import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import User from '../src/models/User';
import Workflow from '../src/models/Workflow';
import WorkflowVersion from '../src/models/WorkflowVersion';
import WorkflowRun from '../src/models/WorkflowRun';
import { executeRun } from '../src/workflow-engine/engine';
import { registerAction } from '../src/actions/registry';
import { resolveTemplate } from '../src/workflow-engine/template';
import { enqueueRun } from '../src/queues';

let mongo: MongoMemoryServer;
let owner: { token: string; id: string };
let otherBuilder: { token: string; id: string };

async function makeUser(email: string, role: string) {
  await new User({ email, name: email.split('@')[0], role, password: 'Password123!' }).save();
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

async function createActiveWorkflow(
  ownerId: string,
  // Engine tests deliberately use kinds outside the static registry
  // (test.flaky, totally.unknown) — definitions are stored untyped.
  definition: unknown
): Promise<string> {
  const wf = await Workflow.create({
    name: 'Engine test workflow',
    owner: ownerId,
    status: 'active',
    latestVersion: 1,
    activeVersion: 1,
  });
  await WorkflowVersion.create({
    workflow: wf._id,
    version: 1,
    definition,
    createdBy: ownerId,
  });
  return String(wf._id);
}

async function createRun(
  workflowId: string,
  ownerId: string,
  payload: unknown,
  opts: { timeoutMs?: number } = {}
): Promise<string> {
  const run = await WorkflowRun.create({
    workflow: workflowId,
    workflowVersion: 1,
    status: 'queued',
    trigger: { type: 'manual', payload },
    idempotencyKey: randomUUID(),
    createdBy: ownerId,
    timeoutMs: opts.timeoutMs ?? 300000,
  });
  return String(run._id);
}

// Flaky test action: throws on its first invocation, succeeds afterwards.
let flakyCalls = 0;
registerAction('test.flaky', async () => {
  flakyCalls += 1;
  if (flakyCalls === 1) throw new Error('transient failure');
  return { output: { ok: true, calls: flakyCalls } };
});

// Slow test action for the timeout scenario.
registerAction('test.slow', async () => {
  await new Promise((r) => setTimeout(r, 2000));
  return { output: { done: true } };
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.deleteMany({});
  owner = await makeUser('owner@flowforge.dev', 'workflow_builder');
  otherBuilder = await makeUser('other@flowforge.dev', 'workflow_builder');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('Workflow execution engine', () => {
  it('(a) two-node manual workflow reaches succeeded with 2 nodeRuns', async () => {
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        { id: 'l1', type: 'action.log', config: { message: 'ran the log action' } },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'l1' }],
    });
    const runId = await createRun(wfId, owner.id, { name: 'Ada' });
    await executeRun(runId);

    const run = await WorkflowRun.findById(runId);
    expect(run?.status).toBe('succeeded');
    expect(run?.startedAt).toBeDefined();
    expect(run?.finishedAt).toBeDefined();

    const nodeRuns = await (mongoose.models.WorkflowNodeRun as any).find({ run: runId });
    expect(nodeRuns).toHaveLength(2);
    expect(nodeRuns.every((n: any) => n.status === 'succeeded')).toBe(true);
    // Trigger node carries the payload as its output.
    const triggerRun = nodeRuns.find((n: any) => n.kind === 'trigger.manual');
    expect(triggerRun.outputSummary).toContain('Ada');
  });

  it('(b) unknown node type fails the run with UNKNOWN_NODE on that nodeRun', async () => {
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        { id: 'x1', type: 'totally.unknown', config: {} },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'x1' }],
    });
    const runId = await createRun(wfId, owner.id, {});
    await executeRun(runId);

    const run = await WorkflowRun.findById(runId);
    expect(run?.status).toBe('failed');
    expect(run?.error?.code).toBe('UNKNOWN_NODE');

    const nodeRuns = await (mongoose.models.WorkflowNodeRun as any).find({ run: runId });
    const unknown = nodeRuns.find((n: any) => n.nodeId === 'x1');
    expect(unknown.status).toBe('failed');
    expect(unknown.error.code).toBe('UNKNOWN_NODE');
    const trigger = nodeRuns.find((n: any) => n.nodeId === 't1');
    expect(trigger.status).toBe('succeeded');
  });

  it('(c) action throwing once succeeds on retry → attempts 2', async () => {
    flakyCalls = 0;
    // The retry policy lives on the node config of the flaky node.
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        {
          id: 'f1',
          type: 'test.flaky',
          config: { retry: { attempts: 2, backoffMs: 5 } },
        },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'f1' }],
    });
    const runId = await createRun(wfId, owner.id, {});
    await executeRun(runId);

    const run = await WorkflowRun.findById(runId);
    expect(run?.status).toBe('succeeded');
    const nodeRuns = await (mongoose.models.WorkflowNodeRun as any).find({ run: runId });
    const flaky = nodeRuns.find((n: any) => n.nodeId === 'f1');
    expect(flaky.status).toBe('succeeded');
    expect(flaky.attempts).toBe(2);
  });

  it('(d) engine timeout → run timed_out', async () => {
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        { id: 's1', type: 'test.slow', config: {} },
      ],
      edges: [{ id: 'e1', source: 't1', target: 's1' }],
    });
    const runId = await createRun(wfId, owner.id, {}, { timeoutMs: 150 });
    await executeRun(runId);

    const run = await WorkflowRun.findById(runId);
    expect(run?.status).toBe('timed_out');
    const nodeRuns = await (mongoose.models.WorkflowNodeRun as any).find({ run: runId });
    const slow = nodeRuns.find((n: any) => n.nodeId === 's1');
    expect(slow.status).toBe('failed');
    expect(slow.error.code).toBe('TIMEOUT');
  });

  it('(e) {{payload.name}} resolves from trigger payload (unit + engine)', async () => {
    // Unit: dot-path lookup against context, no eval.
    const scope = {
      payload: { name: 'Ada', ticket: { number: 'T-42' } },
      vars: { env: 'test' },
      outputs: {},
    };
    expect(resolveTemplate('Hello {{payload.name}}', scope)).toBe('Hello Ada');
    expect(resolveTemplate('{{payload.ticket.number}}', scope)).toBe('T-42');
    expect(resolveTemplate('{{vars.env}}', scope)).toBe('test');
    // Unresolvable path stays literal (debuggable), and no eval is possible.
    expect(resolveTemplate('{{payload.missing}}', scope)).toBe('{{payload.missing}}');

    // Engine: action.log renders the template before logging.
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        { id: 'l1', type: 'action.log', config: { message: 'Hello {{payload.name}}' } },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'l1' }],
    });
    const runId = await createRun(wfId, owner.id, { name: 'Grace' });
    await executeRun(runId);
    const nodeRuns = await (mongoose.models.WorkflowNodeRun as any).find({ run: runId });
    const logNode = nodeRuns.find((n: any) => n.nodeId === 'l1');
    expect(logNode.outputSummary).toContain('Hello Grace');
  });

  it('(f) payload containing password is redacted in outputSummary', async () => {
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [{ id: 't1', type: 'trigger.manual', config: {} }],
      edges: [],
    });
    const runId = await createRun(wfId, owner.id, {
      name: 'x',
      password: 'hunter2-super-secret',
    });
    await executeRun(runId);
    const nodeRuns = await (mongoose.models.WorkflowNodeRun as any).find({ run: runId });
    const triggerRun = nodeRuns.find((n: any) => n.nodeId === 't1');
    expect(triggerRun.outputSummary).not.toContain('hunter2-super-secret');
    expect(triggerRun.outputSummary).toContain('[REDACTED]');
  });

  it('run left queued when workflow already at concurrency limit', async () => {
    const prev = process.env.WORKFLOW_CONCURRENCY_LIMIT;
    process.env.WORKFLOW_CONCURRENCY_LIMIT = '1';
    try {
      const wfId = await createActiveWorkflow(owner.id, {
        nodes: [{ id: 't1', type: 'trigger.manual', config: {} }],
        edges: [],
      });
      // A run already occupying the single slot.
      const blocking = await createRun(wfId, owner.id, {});
      await WorkflowRun.findByIdAndUpdate(blocking, { status: 'running' });

      const runId = await createRun(wfId, owner.id, {});
      await expect(executeRun(runId)).rejects.toThrow('WORKFLOW_CONCURRENCY_LIMIT');
      const run = await WorkflowRun.findById(runId);
      expect(run?.status).toBe('queued');
    } finally {
      if (prev === undefined) delete process.env.WORKFLOW_CONCURRENCY_LIMIT;
      else process.env.WORKFLOW_CONCURRENCY_LIMIT = prev;
    }
  });
});

describe('Execute API', () => {
  it('execute on draft workflow → 409', async () => {
    const wf = await Workflow.create({
      name: 'Draft',
      owner: owner.id,
      status: 'draft',
      latestVersion: 0,
      activeVersion: null,
    });
    const res = await request(app)
      .post(`/api/workflows/${wf._id}/execute`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ payload: {} });
    expect(res.status).toBe(409);
  });

  it('execute creates queued run → 202; non-owner builder → 403', async () => {
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [{ id: 't1', type: 'trigger.manual', config: {} }],
      edges: [],
    });

    const denied = await request(app)
      .post(`/api/workflows/${wfId}/execute`)
      .set('Authorization', `Bearer ${otherBuilder.token}`)
      .send({ payload: {} });
    expect(denied.status).toBe(403);

    const res = await request(app)
      .post(`/api/workflows/${wfId}/execute`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ payload: { ticket: { number: 'T-1' } } });
    expect(res.status).toBe(202);
    expect(res.body.run.status).toBe('queued');
    expect(res.body.run.trigger.type).toBe('manual');
    expect(res.body.run.trigger.payload.ticket.number).toBe('T-1');
    expect(typeof res.body.run.idempotencyKey).toBe('string');
  });

  it('enqueueRun resolves without throwing when Redis is unavailable', async () => {
    // Test env has no REDIS_URL — the queue layer must degrade gracefully.
    await expect(enqueueRun(randomUUID())).resolves.toBeUndefined();
  });
});
