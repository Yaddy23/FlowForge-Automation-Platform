import type { WorkflowDefinition } from 'shared/types/workflow';

export const weeklyReportDefinition: WorkflowDefinition = {
  nodes: [
    { id: 'trigger1', type: 'trigger.schedule', config: { type: 'weekly' } },
    { id: 'action1', type: 'action.report', config: { title: 'Weekly Workflow Report' } },
    { id: 'action2', type: 'action.email', config: { to: '${user.email}', subject: 'Weekly Workflow Report', body: '${JSON.stringify(nodes.action1.output, null, 2)}' } }
  ],
  edges: [
    { id: 'edge1', source: 'trigger1', target: 'action1' },
    { id: 'edge2', source: 'action1', target: 'action2' }
  ]
};