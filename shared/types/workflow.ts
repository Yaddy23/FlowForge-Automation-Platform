export type NodeKind =
  | 'trigger.manual'
  | 'trigger.schedule'
  | 'trigger.webhook'
  | 'trigger.event'
  | 'condition'
  | 'branch'
  | 'action.email'
  | 'action.notify'
  | 'action.webhook'
  | 'action.transform'
  | 'action.filter'
  | 'action.validate'
  | 'action.map-fields'
  | 'action.format-date'
  | 'action.report'
  | 'action.csv'
  | 'action.delay'
  | 'action.log'
  | 'action.reference'
  | 'action.record.create'
  | 'action.record.update';

export interface WorkflowNode {
  id: string;
  type: NodeKind;
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
