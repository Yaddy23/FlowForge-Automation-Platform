import { describe, it, expect } from 'vitest';
import { validateDefinition } from '../src/services/workflow-validator.service';
import type { WorkflowDefinition, WorkflowNode } from 'shared/types/workflow';

const node = (id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode =>
  ({ id, type, config } as unknown as WorkflowNode);
const edge = (id: string, source: string, target: string) => ({ id, source, target });

describe('validateDefinition', () => {
  it('flags two triggers with MULTIPLE_TRIGGERS', () => {
    const def: WorkflowDefinition = {
      nodes: [node('t1', 'trigger.manual'), node('t2', 'trigger.manual')],
      edges: [],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MULTIPLE_TRIGGERS')).toBe(true);
  });

  it('flags action.email missing to with CONFIG_INVALID naming the nodeId', () => {
    const def: WorkflowDefinition = {
      nodes: [node('t1', 'trigger.manual'), node('e1', 'action.email', { subject: 'Hi' })],
      edges: [edge('e-1', 't1', 'e1')],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === 'CONFIG_INVALID');
    expect(err).toBeDefined();
    expect(err?.nodeId).toBe('e1');
  });

  it('flags an edge to a nonexistent node with EDGE_INVALID', () => {
    const def: WorkflowDefinition = {
      nodes: [node('t1', 'trigger.manual')],
      edges: [edge('x1', 't1', 'ghost')],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === 'EDGE_INVALID');
    expect(err).toBeDefined();
    expect(err?.edgeId).toBe('x1');
  });

  it('flags a cycle of action.log nodes with CYCLE_DETECTED', () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'trigger.manual'),
        node('a1', 'action.log'),
        node('a2', 'action.log'),
      ],
      edges: [edge('e1', 't1', 'a1'), edge('e2', 'a1', 'a2'), edge('e3', 'a2', 'a1')],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'CYCLE_DETECTED')).toBe(true);
  });

  it('accepts a cycle broken by a branch node', () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'trigger.manual'),
        node('a1', 'action.log'),
        node('br', 'branch'),
      ],
      edges: [edge('e1', 't1', 'a1'), edge('e2', 'a1', 'br'), edge('e3', 'br', 'a1')],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('flags a trigger-unreachable node with UNREACHABLE', () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'trigger.manual'),
        node('a1', 'action.log'),
        node('a2', 'action.log'),
      ],
      edges: [edge('e1', 't1', 'a1')],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === 'UNREACHABLE');
    expect(err).toBeDefined();
    expect(err?.nodeId).toBe('a2');
  });

  it('accepts a clean linear definition', () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'trigger.manual'),
        node('a1', 'action.email', { to: 'x@y.dev', subject: 'S', body: 'B' }),
      ],
      edges: [edge('e1', 't1', 'a1')],
    };
    const result = validateDefinition(def);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
