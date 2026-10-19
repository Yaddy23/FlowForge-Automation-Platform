import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { executeRun } from '../src/workflow-engine/engine';
import { registerAction } from '../src/actions/registry';
import {
  startMongo,
  stopMongo,
  makeUser,
  createActiveWorkflow,
  createRun,
  nodeRunsOf,
} from './helpers';

let mongo: MongoMemoryServer;
let owner: { token: string; id: string };

// Spies for the "email" and "else" leaf nodes.
let emailCalls: string[];
registerAction('action.email', async (config) => {
  emailCalls.push(String(config.subject ?? ''));
  return { output: { sent: true } };
});
let logCalls: string[];
registerAction('action.log', async (config, ctx) => {
  // Replace the built-in with a spying wrapper (same shape: resolves templates).
  const { resolveTemplate } = await import('../src/workflow-engine/template');
  const message = resolveTemplate(String(config.message ?? ''), ctx);
  logCalls.push(message);
  return { output: { message } };
});

beforeAll(async () => {
  mongo = await startMongo();
  emailCalls = [];
  logCalls = [];
  await makeUser('branch-owner@flowforge.dev', 'workflow_builder').then((u) => (owner = u));
});

afterAll(async () => {
  await stopMongo(mongo);
});

const criticalBranchDef = {
  nodes: [
    { id: 't1', type: 'trigger.manual', config: {} },
    {
      id: 'br',
      type: 'branch',
      config: {
        branches: [
          {
            id: 'critical',
            combinator: 'and',
            conditions: [
              { leftPath: 'payload.ticket.priority', operator: 'equals', right: 'critical' },
            ],
          },
        ],
        fallbackBranchId: 'else',
      },
    },
    { id: 'mail', type: 'action.email', config: { to: 'ops@x.dev', subject: 'Critical ticket' } },
    { id: 'quiet', type: 'action.log', config: { message: 'nothing critical' } },
  ],
  edges: [
    { id: 'e1', source: 't1', target: 'br' },
    { id: 'e2', source: 'br', target: 'mail', sourceHandle: 'critical' },
    { id: 'e3', source: 'br', target: 'quiet', sourceHandle: 'else' },
  ],
};

describe('engine branching', () => {
  it('(b) priority critical → email node runs, else-path skipped', async () => {
    emailCalls = [];
    logCalls = [];
    const wfId = await createActiveWorkflow(owner.id, criticalBranchDef);
    const runId = await createRun(wfId, owner.id, { ticket: { priority: 'critical' } });
    await executeRun(runId);

    const runs = (await nodeRunsOf(runId)) as any[];
    const run = await (await import('../src/models/WorkflowRun')).default.findById(runId);
    expect(run?.status).toBe('succeeded');
    expect(runs.find((n) => n.nodeId === 'mail')?.status).toBe('succeeded');
    expect(emailCalls).toEqual(['Critical ticket']);
    // else-path skipped: no nodeRun at all for the quiet node
    expect(runs.find((n) => n.nodeId === 'quiet')).toBeUndefined();
    expect(logCalls).toEqual([]);
  });

  it('non-matching priority → fallback branch, email skipped', async () => {
    emailCalls = [];
    logCalls = [];
    const wfId = await createActiveWorkflow(owner.id, criticalBranchDef);
    const runId = await createRun(wfId, owner.id, { ticket: { priority: 'low' } });
    await executeRun(runId);

    const runs = (await nodeRunsOf(runId)) as any[];
    const run = await (await import('../src/models/WorkflowRun')).default.findById(runId);
    expect(run?.status).toBe('succeeded');
    expect(runs.find((n) => n.nodeId === 'quiet')?.status).toBe('succeeded');
    expect(logCalls).toEqual(['nothing critical']);
    expect(runs.find((n) => n.nodeId === 'mail')).toBeUndefined();
    expect(emailCalls).toEqual([]);
  });

  it("combinator 'and' with one false condition → fallback branch", async () => {
    emailCalls = [];
    logCalls = [];
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        {
          id: 'br',
          type: 'branch',
          config: {
            branches: [
              {
                id: 'both',
                combinator: 'and',
                conditions: [
                  { leftPath: 'payload.ticket.priority', operator: 'equals', right: 'critical' },
                  { leftPath: 'payload.ticket.escalated', operator: 'is_true' },
                ],
              },
            ],
            fallbackBranchId: 'else',
          },
        },
        { id: 'mail', type: 'action.email', config: { to: 'ops@x.dev', subject: 'Escalated' } },
        { id: 'quiet', type: 'action.log', config: { message: 'no escalation' } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'br' },
        { id: 'e2', source: 'br', target: 'mail', sourceHandle: 'both' },
        { id: 'e3', source: 'br', target: 'quiet', sourceHandle: 'else' },
      ],
    });
    // priority matches but escalated is false → and-combinator fails
    const runId = await createRun(wfId, owner.id, { ticket: { priority: 'critical', escalated: false } });
    await executeRun(runId);

    const runs = (await nodeRunsOf(runId)) as any[];
    expect(runs.find((n) => n.nodeId === 'quiet')?.status).toBe('succeeded');
    expect(runs.find((n) => n.nodeId === 'mail')).toBeUndefined();
  });

  it("combinator 'or' with one true condition → branch taken", async () => {
    emailCalls = [];
    logCalls = [];
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        {
          id: 'br',
          type: 'branch',
          config: {
            branches: [
              {
                id: 'any',
                combinator: 'or',
                conditions: [
                  { leftPath: 'payload.ticket.priority', operator: 'equals', right: 'low' },
                  { leftPath: 'payload.ticket.tags', operator: 'contains', right: 'urgent' },
                ],
              },
            ],
            fallbackBranchId: 'else',
          },
        },
        { id: 'mail', type: 'action.email', config: { to: 'ops@x.dev', subject: 'Urgent' } },
        { id: 'quiet', type: 'action.log', config: { message: 'calm' } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'br' },
        { id: 'e2', source: 'br', target: 'mail', sourceHandle: 'any' },
        { id: 'e3', source: 'br', target: 'quiet', sourceHandle: 'else' },
      ],
    });
    const runId = await createRun(wfId, owner.id, { ticket: { priority: 'low', tags: ['urgent'] } });
    await executeRun(runId);

    const runs = (await nodeRunsOf(runId)) as any[];
    expect(runs.find((n) => n.nodeId === 'mail')?.status).toBe('succeeded');
    expect(emailCalls).toEqual(['Urgent']);
  });

  it('condition node routes via true/false source handles', async () => {
    emailCalls = [];
    logCalls = [];
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        {
          id: 'cond',
          type: 'condition',
          config: { leftPath: 'payload.amount', operator: 'gt', right: '100' },
        },
        { id: 'big', type: 'action.email', config: { to: 'fin@x.dev', subject: 'Big' } },
        { id: 'small', type: 'action.log', config: { message: 'small' } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'big', sourceHandle: 'true' },
        { id: 'e3', source: 'cond', target: 'small', sourceHandle: 'false' },
      ],
    });

    const runTrue = await createRun(wfId, owner.id, { amount: 250 });
    await executeRun(runTrue);
    let runs = (await nodeRunsOf(runTrue)) as any[];
    expect(runs.find((n) => n.nodeId === 'big')?.status).toBe('succeeded');
    expect(emailCalls).toEqual(['Big']);
    expect(runs.find((n) => n.nodeId === 'small')).toBeUndefined();

    const runFalse = await createRun(wfId, owner.id, { amount: 50 });
    await executeRun(runFalse);
    runs = (await nodeRunsOf(runFalse)) as any[];
    expect(runs.find((n) => n.nodeId === 'small')?.status).toBe('succeeded');
    expect(logCalls).toContain('small');
    expect(runs.find((n) => n.nodeId === 'big')).toBeUndefined();
  });

  it('condition nodeRun records the decision in outputSummary', async () => {
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        {
          id: 'cond',
          type: 'condition',
          config: { leftPath: 'payload.flag', operator: 'is_true' },
        },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'cond' }],
    });
    const runId = await createRun(wfId, owner.id, { flag: true });
    await executeRun(runId);
    const runs = (await nodeRunsOf(runId)) as any[];
    const cond = runs.find((n) => n.nodeId === 'cond');
    expect(cond?.status).toBe('succeeded');
    expect(cond?.outputSummary).toContain('"passed":true');
  });

  it('diamond graph still executes each node once (T8 regression)', async () => {
    logCalls = [];
    const wfId = await createActiveWorkflow(owner.id, {
      nodes: [
        { id: 't1', type: 'trigger.manual', config: {} },
        { id: 'a', type: 'action.log', config: { message: 'a' } },
        { id: 'b', type: 'action.log', config: { message: 'b' } },
        { id: 'c', type: 'action.log', config: { message: 'c' } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'a' },
        { id: 'e2', source: 't1', target: 'b' },
        { id: 'e3', source: 'a', target: 'c' },
        { id: 'e4', source: 'b', target: 'c' },
      ],
    });
    const runId = await createRun(wfId, owner.id, {});
    await executeRun(runId);
    const runs = (await nodeRunsOf(runId)) as any[];
    expect(runs.filter((n) => n.nodeId === 'c')).toHaveLength(1);
    expect(logCalls.sort()).toEqual(['a', 'b', 'c']);
  });
});
