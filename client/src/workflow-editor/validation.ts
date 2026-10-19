import type { WorkflowDefinition } from 'shared/types/workflow';
import { getKindMeta } from './registry';

export interface EditorValidationIssue {
  nodeId?: string;
  message: string;
}

/**
 * Client-side validation mirroring the Task 5 server checks that matter for
 * drafting UX: exactly one trigger, required config fields present, edges
 * connect existing nodes, and every node reachable from the trigger. The
 * server registry remains the authority at save/activate time.
 */
export function validateDefinitionClient(def: WorkflowDefinition): EditorValidationIssue[] {
  const issues: EditorValidationIssue[] = [];
  const triggers = def.nodes.filter((n) => getKindMeta(n.type)?.category === 'trigger');

  if (triggers.length !== 1) {
    issues.push({ message: `Workflow needs exactly one trigger node (found ${triggers.length})` });
  }

  for (const node of def.nodes) {
    const meta = getKindMeta(node.type);
    if (!meta) {
      issues.push({ nodeId: node.id, message: `Unknown node type "${node.type}"` });
      continue;
    }
    for (const field of meta.fields) {
      if (!field.required) continue;
      const value = node.config?.[field.key];
      if (value === undefined || value === null || String(value).trim() === '') {
        issues.push({ nodeId: node.id, message: `${meta.label}: "${field.label}" is required` });
      }
    }
  }

  const ids = new Set(def.nodes.map((n) => n.id));
  for (const edge of def.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      issues.push({ message: `Edge connects nonexistent nodes (${edge.source} → ${edge.target})` });
    }
  }

  if (triggers.length === 1) {
    const adjacency = new Map<string, string[]>();
    for (const e of def.edges) {
      if (!ids.has(e.source) || !ids.has(e.target)) continue;
      adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
    }
    const visited = new Set([triggers[0].id]);
    const queue = [triggers[0].id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of adjacency.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    for (const node of def.nodes) {
      if (node.id !== triggers[0].id && !visited.has(node.id)) {
        issues.push({ nodeId: node.id, message: `${getKindMeta(node.type)?.label ?? node.type} is not reachable from the trigger` });
      }
    }
  }

  return issues;
}
