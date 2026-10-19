import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import { executeRun } from '../src/workflow-engine/engine';
import { registerAction } from '../src/actions/registry';
import WorkflowRun from '../src/models/WorkflowRun';
import {
  startMongo,
  stopMongo,
  makeUser,
  createActiveWorkflow,
  createRun,
  nodeRunsOf,
} from './helpers';

// Per-file test handlers (isolated from other test files).
let flakyCalls = 0;
registerAction('test.flaky', async () => {
  flakyCalls += 1;
  if (flakyCalls === 1) throw new Error('transient flake');
  return { output: { call: flakyCalls } };
});
registerAction('test.slow', async () => {
  await new Promise((r) => setTimeout(r, 600));
  return { output: { done: true } };
});

let mongo: MongoMemoryServer;
let owner: { token: string; id: string };
let viewer: { token: string; id: string };

const okWorkflow = async () =>
  createActiveWorkflow(owner.id, {
    nodes: [
      { id: 't1', type: 'trigger.manual', config: {} },
      { id: 'l1', type: 'action.log', config: { message: 'hello-log' } },
    ],
    edges: [{ id: 'e1', source: 't1', target: 'l1' }],
  });

const flakyWorkflow = async () =>
  createActiveWorkflow(owner.id, {
    nodes: [
      { id: 't1', type: 'trigger.manual', config: {} },
      { id: 'f1', type: 'test.flaky', config: {} },
    ],
    edges: [{ id: 'e1', source: 't1', target: 'f1' }],
  });

const slowWorkflow = async () =>
  createActiveWorkflow(owner.id, {
    nodes: [
      { id: 't1', type: 'trigger.manual', config: {} },
      { id: 's1', type: 'test.slow', config: {} },
    ],
    edges: [{ id: 'e1', source: 't1', target: 's1' }],
  });

const failingWorkflow = async () =>
  createActiveWorkflow(owner.id, {
    nodes: [
      { id: 't1', type: 'trigger.manual', config: {} },
      { id: 'flt1', type: 'action.filter', config: { inputPath: 'payload.items', operator: 'equals', value: 'x' } },
    ],
    edges: [{ id: 'e1', source: 't1', target: 'flt1' }],
  });

beforeAll(async () => {
  mongo = await startMongo();
  owner = await makeUser('runs-owner@flowforge.dev', 'workflow_builder');
  viewer = await makeUser('runs-viewer@flowforge.dev', 'viewer');
});
afterAll(async () => {
  await stopMongo(mongo);
});
beforeEach(() => {
  flakyCalls = 0;
});

describe('GET /api/runs (list)', () => {
  it('lists runs paginated and filterable by status and workflow', async () => {
    const wfA = await okWorkflow();
    const wfB = await failingWorkflow();

    const r1 = await createRun(wfA, owner.id, {});
    await executeRun(r1); // succeeded
    const r2 = await createRun(wfA, owner.id, {});
    await executeRun(r2); // succeeded
    const r3 = await createRun(wfB, owner.id, {});
    await executeRun(r3); // failed (filter input not an array)

    // Pagination
    const page1 = await request(app)
      .get('/api/runs?page=1&limit=2')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.page).toBe(1);

    // Status filter
    const failed = await request(app)
      .get('/api/runs?status=failed')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(failed.status).toBe(200);
    expect(failed.body.total).toBe(1);
    expect(String(failed.body.data[0]._id)).toBe(r3);
    // Failed runs carry their error on the list item
    expect(failed.body.data[0].error?.code).toBeDefined();

    // Workflow filter
    const byWf = await request(app)
      .get(`/api/runs?workflowId=${wfA}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(byWf.status).toBe(200);
    expect(byWf.body.total).toBe(2);
    // Workflow name populated for the list page
    expect(byWf.body.data[0].workflow?.name).toBeDefined();

    // Trigger filter
    const byTrigger = await request(app)
      .get('/api/runs?trigger=manual')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(byTrigger.body.total).toBe(3);

    // Date range filter
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const byDate = await request(app)
      .get(`/api/runs?from=${new Date(Date.now() - 3600 * 1000).toISOString()}&to=${tomorrow}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(byDate.body.total).toBe(3);
    const future = await request(app)
      .get(`/api/runs?from=${tomorrow}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(future.body.total).toBe(0);
  });

  it('lets a viewer read runs', async () => {
    const res = await request(app).get('/api/runs').set('Authorization', `Bearer ${viewer.token}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/runs/:id (detail with node timeline)', () => {
  it('returns the run with its nodeRuns, secrets redacted and nodeOutputs stripped', async () => {
    const wfId = await okWorkflow();
    const createRes = await request(app)
      .post(`/api/workflows/${wfId}/execute`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ payload: { authorization: 'Bearer topsecret-token-value', plain: 'ok' } });
    expect(createRes.status).toBe(202);
    const runId = createRes.body.run._id as string;

    await executeRun(runId);

    const res = await request(app)
      .get(`/api/runs/${runId}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toContain('topsecret-token-value');
    expect(bodyText).toContain('[REDACTED]');
    // Server-only resume context must never leak through the API.
    expect(bodyText).not.toContain('nodeOutputs');

    expect(Array.isArray(res.body.nodeRuns)).toBe(true);
    const logNode = res.body.nodeRuns.find((n: { nodeId: string }) => n.nodeId === 'l1');
    expect(logNode?.status).toBe('succeeded');
    expect(logNode?.outputSummary).toBeDefined();
  });

  it('404s for an unknown run', async () => {
    const res = await request(app)
      .get(`/api/runs/${new mongoose.Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/runs/:id/retry', () => {
  it('retries only failed/timed_out runs, re-executing just the failed node', async () => {
    const wfId = await flakyWorkflow();
    const runId = await createRun(wfId, owner.id, {});
    await executeRun(runId);

    let run = await WorkflowRun.findById(runId);
    expect(run?.status).toBe('failed');

    // Viewer cannot retry (403).
    const viewerRes = await request(app)
      .post(`/api/runs/${runId}/retry`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(viewerRes.status).toBe(403);

    // A succeeded run is not eligible.
    const okWf = await okWorkflow();
    const okRun = await createRun(okWf, owner.id, {});
    await executeRun(okRun);
    const ineligible = await request(app)
      .post(`/api/runs/${okRun}/retry`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(ineligible.status).toBe(409);

    // Owner retries the failed run → queued again, then completes.
    const res = await request(app)
      .post(`/api/runs/${runId}/retry`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(202);
    expect(res.body.run.status).toBe('queued');

    await executeRun(runId);
    run = await WorkflowRun.findById(runId);
    expect(run?.status).toBe('succeeded');

    // The failed node re-ran exactly once more; the trigger was not re-executed.
    const runs = (await nodeRunsOf(runId)) as Array<{ nodeId: string; status: string }>;
    expect(runs.filter((n) => n.nodeId === 't1')).toHaveLength(1);
    expect(runs.filter((n) => n.nodeId === 'f1')).toHaveLength(2);
    expect(runs.filter((n) => n.nodeId === 'f1' && n.status === 'succeeded')).toHaveLength(1);
  });
});

describe('POST /api/runs/:id/cancel', () => {
  it('cancels a running run and the engine does not overwrite it', async () => {
    const wfId = await slowWorkflow();
    const runId = await createRun(wfId, owner.id, {});

    const execution = executeRun(runId);
    // Wait until the engine is mid-run.
    let status = '';
    for (let i = 0; i < 50; i += 1) {
      status = (await WorkflowRun.findById(runId).select('status'))?.status ?? '';
      if (status === 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(status).toBe('running');

    const res = await request(app)
      .post(`/api/runs/${runId}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.run.status).toBe('cancelled');

    await execution;
    const run = await WorkflowRun.findById(runId);
    expect(run?.status).toBe('cancelled');
    expect(run?.finishedAt).toBeDefined();
  });

  it('refuses to cancel a finished run (409) and viewers cannot cancel (403)', async () => {
    const wfId = await okWorkflow();
    const runId = await createRun(wfId, owner.id, {});
    await executeRun(runId);

    const viewerRes = await request(app)
      .post(`/api/runs/${runId}/cancel`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(viewerRes.status).toBe(403);

    const res = await request(app)
      .post(`/api/runs/${runId}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(409);
  });
});

describe('GET /api/runs/:id/logs (NDJSON download)', () => {
  it('serves the run log as redacted NDJSON', async () => {
    const wfId = await okWorkflow();
    const runId = await createRun(wfId, owner.id, {});
    await executeRun(runId);

    const res = await request(app)
      .get(`/api/runs/${runId}/logs`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    const lines = res.text.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(res.text).toContain('hello-log');
  });

  it('404s when a run has no log', async () => {
    const wfId = await okWorkflow();
    const runId = await createRun(wfId, owner.id, {}); // never executed
    const res = await request(app)
      .get(`/api/runs/${runId}/logs`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(404);
  });
});
