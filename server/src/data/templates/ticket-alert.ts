import type { WorkflowDefinition } from 'shared/types/workflow';

export const ticketAlertDefinition: WorkflowDefinition = {
  nodes: [
    { id: 'trigger1', type: 'trigger.event', config: { eventName: 'ticket.created' } },
    { id: 'condition1', type: 'condition', config: { leftPath: 'payload.priority', operator: 'equals', value: 'critical' } },
    { id: 'action1', type: 'action.notify', config: { message: 'Critical ticket: ${payload.title} (${payload.number})' } }
  ],
  edges: [
    { id: 'edge1', source: 'trigger1', target: 'condition1' },
    { id: 'edge2', source: 'condition1', target: 'action1' }
  ]
};