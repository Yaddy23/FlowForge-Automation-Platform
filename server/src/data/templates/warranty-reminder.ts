import type { WorkflowDefinition } from 'shared/types/workflow';

export const warrantyReminderDefinition: WorkflowDefinition = {
  nodes: [
    { id: 'trigger1', type: 'trigger.event', config: { eventName: 'asset.warranty_expiring' } },
    { id: 'action1', type: 'action.notify', config: { message: 'Warranty expiring: ${payload.assetName} expires on ${payload.expiryDate}' } }
  ],
  edges: [
    { id: 'edge1', source: 'trigger1', target: 'action1' }
  ]
};