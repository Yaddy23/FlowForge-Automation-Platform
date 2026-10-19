import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { executeRun } from '../src/workflow-engine/engine';
import { registerAllActions } from '../src/actions';
import { getActionHandler } from '../src/actions/registry';
import Notification from '../src/models/Notification';
import User from '../src/models/User';
import type { RunContext, RunLogger } from '../src/workflow-engine/context';
import { validateDefinition } from '../src/services/workflow-validator.service';
import type { WorkflowDefinition } from 'shared/types/workflow';
import { startMongo, stopMongo, makeUser, createActiveWorkflow, createRun, nodeRunsOf } from './helpers';

vi.mock('../src/services/mailer', () => ({
  sendMail: vi.fn(async () => undefined),
}));

import { sendMail } from '../src/services/mailer';
const sendMailMock = vi.mocked(sendMail);

function fakeLogger(): RunLogger {
  return { info() {}, warn() {}, error() {}, lines: [] };
}

function makeCtx(payload: unknown = {}): RunContext {
  return {
    workflow: { _id: 'w' } as unknown as RunContext['workflow'],
    version: { version: 1, definition: { nodes: [], edges: [] } },
    run: { _id: 'r' } as unknown as RunContext['run'],
    payload,
    triggerPayload: payload,
    vars: {},
    nodeOutputs: {},
    logger: fakeLogger(),
  };
}

beforeAll(() => {
  registerAllActions();
});

describe('action config schemas (Task 5 registry)', () => {
  const defWith = (config: Record<string, unknown>): WorkflowDefinition => ({
    nodes: [
      { id: 't1', type: 'trigger.manual', config: {} },
      { id: 'a1', type: 'action.log', config: { message: 'x' } },
      { id: 'a2', type: config.__kind as never, config } as never,
    ],
    edges: [{ id: 'e1', source: 't1', target: 'a2' }],
  });
  void defWith;

  const validateNode = (kind: string, config: Record<string, unknown>) =>
    validateDefinition({
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        { id: 'a1', type: kind as never, config },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'a1' }],
    });

  it('rejects action.notify without message', () => {
    const res = validateNode('action.notify', {});
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'CONFIG_INVALID' && e.nodeId === 'a1')).toBe(true);
  });

  it('rejects action.transform without mappings object', () => {
    expect(validateNode('action.transform', { mappings: 'nope' }).valid).toBe(false);
  });

  it('rejects action.filter with an unknown operator', () => {
    expect(
      validateNode('action.filter', { inputPath: 'payload.items', operator: 'regex_match', value: 'x' }).valid
    ).toBe(false);
  });

  it('rejects action.map-fields with non-string source paths', () => {
    expect(validateNode('action.map-fields', { inputPath: 'payload', mapping: { c: 5 } }).valid).toBe(false);
  });

  it('rejects action.validate without a schema object', () => {
    expect(validateNode('action.validate', { schema: 'not-an-object' }).valid).toBe(false);
  });

  it('rejects action.csv with an unknown operation', () => {
    expect(validateNode('action.csv', { operation: 'transpose' }).valid).toBe(false);
  });

  it('rejects action.delay with a non-positive duration', () => {
    expect(validateNode('action.delay', { durationMs: 0 }).valid).toBe(false);
  });

  it('accepts well-formed configs for every registered action kind', () => {
    const good: [string, Record<string, unknown>][] = [
      ['action.email', { to: 'a@b.dev', subject: 'S' }],
      ['action.notify', { message: 'hello' }],
      ['action.webhook', { url: 'https://x.dev/hook', method: 'POST' }],
      ['action.transform', { mappings: { a: '1' } }],
      ['action.filter', { inputPath: 'payload.items', operator: 'equals', value: 'open' }],
      ['action.validate', { schema: { type: 'object' } }],
      ['action.map-fields', { inputPath: 'payload', mapping: { c: 'a.b' } }],
      ['action.delay', { durationMs: 100 }],
      ['action.log', { message: 'm' }],
      ['action.format-date', { value: '2030-01-01T00:00:00Z' }],
      ['action.reference', { prefix: 'FF' }],
      ['action.record.create', { collection: 'records', data: {} }],
      ['action.record.update', { collection: 'records', filter: {}, data: {} }],
      ['action.report', { title: 'T' }],
      ['action.csv', { operation: 'parse' }],
    ];
    for (const [kind, config] of good) {
      const res = validateNode(kind, config);
      expect(res.errors, kind).toEqual([]);
    }
  });
});

describe('action handlers (unit)', () => {
  it('transform returns resolved mappings as output.data', async () => {
    const handler = getActionHandler('action.transform')!;
    const { output } = await handler({ mappings: { a: 'x', b: 2 } }, makeCtx());
    expect(output.data).toEqual({ a: 'x', b: 2 });
  });

  it('filter keeps matching items (string path + operator)', async () => {
    const handler = getActionHandler('action.filter')!;
    const { output } = await handler(
      { inputPath: 'payload.items', path: 'status', operator: 'equals', value: 'open' },
      makeCtx({ items: [{ status: 'open' }, { status: 'closed' }, { status: 'open' }] })
    );
    expect(output.kept).toBe(2);
    expect((output.items as unknown[])).toHaveLength(2);
  });

  it('filter rejects a non-array input', async () => {
    const handler = getActionHandler('action.filter')!;
    await expect(
      handler({ inputPath: 'payload.items', operator: 'equals', value: 'x' }, makeCtx({ items: 'nope' }))
    ).rejects.toThrowError(/FILTER_INPUT/);
  });

  it('validate-data passes and fails per JSON schema via AJV', async () => {
    const handler = getActionHandler('action.validate')!;
    const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' } } };
    const ok = await handler({ schema, data: { name: 'Ada' } }, makeCtx());
    expect(ok.output.valid).toBe(true);
    expect(ok.output.errors).toEqual([]);

    const bad = await handler({ schema, data: {} }, makeCtx());
    expect(bad.output.valid).toBe(false);
    expect((bad.output.errors as unknown[]).length).toBeGreaterThan(0);
  });

  it('map-fields projects source paths onto new keys', async () => {
    const handler = getActionHandler('action.map-fields')!;
    const { output } = await handler(
      { inputPath: 'payload', mapping: { title: 'ticket.title', n: 'ticket.n' } },
      makeCtx({ ticket: { title: 'Printer on fire', n: 7 } })
    );
    expect(output).toEqual({ title: 'Printer on fire', n: 7 });
  });

  it('format-date renders with timezone and format', async () => {
    const handler = getActionHandler('action.format-date')!;
    const { output } = await handler(
      { value: '2030-01-01T00:00:00Z', format: 'YYYY-MM-DD', timezone: 'UTC' },
      makeCtx()
    );
    expect(output.formatted).toBe('2030-01-01');

    const ny = await handler(
      { value: '2030-01-01T00:00:00Z', format: 'YYYY-MM-DD', timezone: 'America/New_York' },
      makeCtx()
    );
    expect(ny.output.formatted).toBe('2029-12-31');
  });

  it('format-date throws INVALID_DATE for unparseable input', async () => {
    const handler = getActionHandler('action.format-date')!;
    await expect(handler({ value: 'garbage' }, makeCtx())).rejects.toThrowError(/INVALID_DATE/);
  });

  it('generate-reference produces FF-<base36>-<rand4> shape and honors prefix', async () => {
    const handler = getActionHandler('action.reference')!;
    const { output } = await handler({ prefix: 'FF' }, makeCtx());
    expect(String(output.reference)).toMatch(/^FF-[0-9A-Z]+-[0-9A-F]{4}$/);
    const custom = await handler({ prefix: 'YAD' }, makeCtx());
    expect(String(custom.output.reference)).toMatch(/^YAD-/);
  });

  it('webhook-out posts through the safe-URL stub and reports status', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const handler = getActionHandler('action.webhook')!;
      const { output } = await handler(
        { url: 'https://example.com/hook', method: 'POST', body: { a: 1 } },
        makeCtx()
      );
      expect(output.status).toBe(200);
      expect(output.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(String(url)).toBe('https://example.com/hook');
      expect(init.method).toBe('POST');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('webhook-out refuses non-http(s) URLs', async () => {
    const handler = getActionHandler('action.webhook')!;
    await expect(
      handler({ url: 'ftp://example.com/x' }, makeCtx())
    ).rejects.toThrowError(/UNSAFE_URL/);
  });
});

describe('record actions (whitelisted collections)', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await startMongo();
  });
  afterAll(async () => {
    await stopMongo(mongo);
  });

  it('creates a record in an allowed collection', async () => {
    const handler = getActionHandler('action.record.create')!;
    const { output } = await handler(
      { collection: 'records', data: { kind: 'ticket', title: 'Printer on fire' } },
      makeCtx()
    );
    expect(output.insertedId).toBeDefined();
    const coll = mongoose.connection.db!.collection('records');
    const doc = await coll.findOne({ kind: 'ticket' });
    expect(doc?.title).toBe('Printer on fire');
  });

  it('updates records in an allowed collection', async () => {
    const create = getActionHandler('action.record.create')!;
    await create({ collection: 'records', data: { kind: 'ticket', status: 'open' } }, makeCtx());
    const update = getActionHandler('action.record.update')!;
    const { output } = await update(
      { collection: 'records', filter: { kind: 'ticket', status: 'open' }, data: { status: 'done' } },
      makeCtx()
    );
    expect(output.modified).toBe(1);
  });

  it('refuses collections outside the whitelist', async () => {
    const handler = getActionHandler('action.record.create')!;
    await expect(
      handler({ collection: 'users', data: { hacked: true } }, makeCtx())
    ).rejects.toThrowError(/RECORD_COLLECTION_NOT_ALLOWED/);
    await expect(
      handler({ collection: 'workflowruns', data: {} }, makeCtx())
    ).rejects.toThrowError(/RECORD_COLLECTION_NOT_ALLOWED/);
  });
});

describe('notify action', () => {
  let mongo: MongoMemoryServer;
  let admin: { token: string; id: string };

  beforeAll(async () => {
    mongo = await startMongo();
    admin = await makeUser('notify-admin@flowforge.dev', 'workflow_admin');
  });
  afterAll(async () => {
    await stopMongo(mongo);
  });

  it('creates a notification for a target user', async () => {
    const handler = getActionHandler('action.notify')!;
    const { output } = await handler(
      { userId: admin.id, message: 'Printer on fire' },
      makeCtx()
    );
    expect(output.notified).toBe(1);
    const docs = await Notification.find({ user: admin.id });
    expect(docs).toHaveLength(1);
    expect(docs[0].message).toBe('Printer on fire');
    expect(docs[0].read).toBe(false);
  });

  it('falls back to notifying all admins by role', async () => {
    await makeUser('second-admin@flowforge.dev', 'workflow_admin');
    const handler = getActionHandler('action.notify')!;
    const { output } = await handler({ role: 'workflow_admin', message: 'Heads up' }, makeCtx());
    expect(output.notified).toBeGreaterThanOrEqual(2);
    const docs = await Notification.find({ message: 'Heads up' });
    expect(docs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('email action through the engine (template rendering)', () => {
  let mongo: MongoMemoryServer;
  let owner: { token: string; id: string };

  beforeAll(async () => {
    mongo = await startMongo();
    owner = await makeUser('mail-owner@flowforge.dev', 'workflow_builder');
  });
  afterAll(async () => {
    await stopMongo(mongo);
  });

  it('sends mail with {{...}} templates rendered from the trigger payload', async () => {
    sendMailMock.mockClear();
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        {
          id: 'm1',
          type: 'action.email',
          config: {
            to: 'ops@flowforge.dev',
            subject: 'Ticket {{payload.ticket.number}}',
            body: 'Priority: {{payload.ticket.priority}}',
          },
        },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'm1' }],
    });
    const runId = await createRun(wfId, owner.id, { ticket: { number: 'T-9', priority: 'critical' } });
    await executeRun(runId);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ops@flowforge.dev', subject: 'Ticket T-9', body: 'Priority: critical' })
    );
    const runs = (await nodeRunsOf(runId)) as any[];
    expect(runs.find((n) => n.nodeId === 'm1')?.status).toBe('succeeded');
  });
});

describe('delay action through the engine (waiting → resume)', () => {
  let mongo: MongoMemoryServer;
  let owner: { token: string; id: string };

  beforeAll(async () => {
    mongo = await startMongo();
    owner = await makeUser('delay-owner@flowforge.dev', 'workflow_builder');
  });
  afterAll(async () => {
    await stopMongo(mongo);
  });

  it('transitions the run to waiting, then resumes to completion', async () => {
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        { id: 'd1', type: 'action.delay', config: { durationMs: 30 } },
        { id: 'l1', type: 'action.log', config: { message: 'resumed!' } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'd1' },
        { id: 'e2', source: 'd1', target: 'l1' },
      ],
    });
    const runId = await createRun(wfId, owner.id, {});

    // First pass: the delay node stops the walk mid-run.
    await executeRun(runId);
    let run = await (await import('../src/models/WorkflowRun')).default.findById(runId);
    expect(run?.status).toBe('waiting');
    let runs = (await nodeRunsOf(runId)) as any[];
    expect(runs.find((n) => n.nodeId === 'd1')?.status).toBe('succeeded');
    expect(runs.find((n) => n.nodeId === 'l1')).toBeUndefined();

    // Second pass (the delayed BullMQ job fires executeRun again): completes.
    await executeRun(runId);
    run = await (await import('../src/models/WorkflowRun')).default.findById(runId);
    expect(run?.status).toBe('succeeded');
    runs = (await nodeRunsOf(runId)) as any[];
    expect(runs.find((n) => n.nodeId === 'l1')?.status).toBe('succeeded');
    // No duplicate node-runs for the completed prefix.
    expect(runs.filter((n) => n.nodeId === 'd1')).toHaveLength(1);
  });
});

describe('csv + report actions (unit)', () => {
  it('csv parses a CSV string into objects', async () => {
    const handler = getActionHandler('action.csv')!;
    const { output } = await handler(
      { operation: 'parse', data: 'name,qty\nWidget,2\nGadget,5' },
      makeCtx()
    );
    expect(output.rows).toEqual([
      { name: 'Widget', qty: '2' },
      { name: 'Gadget', qty: '5' },
    ]);
  });

  it('csv generates a CSV string from an array', async () => {
    const handler = getActionHandler('action.csv')!;
    const { output } = await handler(
      { operation: 'generate', inputPath: 'payload.items' },
      makeCtx({ items: [{ name: 'Widget', qty: 2 }, { name: 'Gadget', qty: 5 }] })
    );
    const lines = String(output.csv).split('\n');
    expect(lines[0]).toBe('name,qty');
    expect(lines[1]).toContain('Widget');
  });

  it('report summarizes the run outputs', async () => {
    const handler = getActionHandler('action.report')!;
    const ctx = makeCtx();
    ctx.nodeOutputs['a1'] = { message: 'done' };
    const { output } = await handler({ title: 'Weekly summary' }, ctx);
    expect(output.title).toBe('Weekly summary');
    expect(output.generatedAt).toBeDefined();
    expect(output.data).toEqual({ a1: { message: 'done' } });
  });
});
