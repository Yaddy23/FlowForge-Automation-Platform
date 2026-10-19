import type { WorkflowDefinition, WorkflowNode } from 'shared/types/workflow';
import { getNodeSpec } from '../registry/node-registry';

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  code:
    | 'MULTIPLE_TRIGGERS'
    | 'UNKNOWN_NODE_TYPE'
    | 'CONFIG_INVALID'
    | 'EDGE_INVALID'
    | 'CYCLE_DETECTED'
    | 'UNREACHABLE';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a workflow definition:
 * 1. exactly one trigger node
 * 2. every node type is registered and its config matches the registry Zod schema
 * 3. every edge connects existing nodes
 * 4. no cycles, unless every cycle path passes through a branch node
 * 5. every non-trigger node reachable from the trigger
 */
export function validateDefinition(def: WorkflowDefinition): ValidationResult {
  const errors: ValidationError[] = [];

  if (!def || !Array.isArray(def.nodes) || !Array.isArray(def.edges)) {
    return {
      valid: false,
      errors: [{ code: 'CONFIG_INVALID', message: 'Definition must contain nodes and edges arrays' }],
    };
  }

  const nodes = def.nodes;
  const edges = def.edges;
  const nodeIds = new Set(nodes.map((n) => n.id));

  // --- 1. exactly one trigger
  const triggers = nodes.filter((n) => getNodeSpec(n.type)?.category === 'trigger');
  if (triggers.length !== 1) {
    errors.push({
      code: 'MULTIPLE_TRIGGERS',
      message: `Definition must have exactly one trigger node (found ${triggers.length})`,
    });
  }

  // --- 2. node types + configs
  for (const n of nodes) {
    const spec = getNodeSpec(n.type);
    if (!spec) {
      errors.push({
        nodeId: n.id,
        code: 'UNKNOWN_NODE_TYPE',
        message: `Unknown node type "${n.type}" on node ${n.id}`,
      });
      continue;
    }
    const parsed = spec.config.safeParse(n.config ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      errors.push({
        nodeId: n.id,
        code: 'CONFIG_INVALID',
        message: `Invalid config on node ${n.id} (${n.type}): ${first ? `${first.path.join('.') || '(root)'} ${first.message}` : 'schema mismatch'}`,
      });
    }
  }

  // --- 3. edges connect existing nodes
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      errors.push({
        edgeId: e.id,
        code: 'EDGE_INVALID',
        message: `Edge ${e.id} connects nonexistent nodes (${e.source} → ${e.target})`,
      });
    }
  }

  // --- 4. cycle detection, ignoring branch nodes (cycles may pass through branches)
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue; // already reported
    const list = adjacency.get(e.source) ?? [];
    list.push(e.target);
    adjacency.set(e.source, list);
  }

  const isBranch = (n: WorkflowNode) => getNodeSpec(n.type)?.category === 'logic';
  const cycleNodes = nodes.filter((n) => !isBranch(n));
  const cycleAdj = new Map<string, string[]>();
  for (const n of cycleNodes) {
    cycleAdj.set(
      n.id,
      (adjacency.get(n.id) ?? []).filter((t) => cycleNodes.some((c) => c.id === t))
    );
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(cycleNodes.map((n) => [n.id, WHITE]));
  let cycleFound = false;

  const dfs = (id: string) => {
    if (cycleFound) return;
    color.set(id, GRAY);
    for (const next of cycleAdj.get(id) ?? []) {
      const c = color.get(next) ?? BLACK;
      if (c === GRAY) {
        cycleFound = true;
        return;
      }
      if (c === WHITE) dfs(next);
    }
    color.set(id, BLACK);
  };
  for (const n of cycleNodes) {
    if (!cycleFound && color.get(n.id) === WHITE) dfs(n.id);
  }
  if (cycleFound) {
    errors.push({
      code: 'CYCLE_DETECTED',
      message: 'Workflow graph contains a cycle not broken by a branch node',
    });
  }

  // --- 5. reachability from the trigger (full graph, branch edges included)
  const trigger = triggers[0];
  if (trigger) {
    const visited = new Set<string>([trigger.id]);
    const queue = [trigger.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of adjacency.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    for (const n of nodes) {
      if (n.id !== trigger.id && !visited.has(n.id)) {
        errors.push({
          nodeId: n.id,
          code: 'UNREACHABLE',
          message: `Node ${n.id} is not reachable from the trigger`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
