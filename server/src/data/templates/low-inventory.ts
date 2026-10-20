import type { WorkflowDefinition } from 'shared/types/workflow';

export const lowInventoryDefinition: WorkflowDefinition = {
  nodes: [
    { id: 'trigger1', type: 'trigger.event', config: { eventName: 'inventory.low' } },
    { id: 'action1', type: 'action.notify', config: { message: 'Low inventory: ${payload.itemName} (${payload.quantity} left)' } }
  ],
  edges: [
    { id: 'edge1', source: 'trigger1', target: 'action1' }
  ]
};