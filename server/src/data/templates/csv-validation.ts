import type { WorkflowDefinition } from 'shared/types/workflow';

export const csvValidationDefinition: WorkflowDefinition = {
  nodes: [
    { id: 'trigger1', type: 'trigger.manual', config: {} },
    { id: 'action1', type: 'action.csv', config: { operation: 'parse', data: '${payload}' } },
    { id: 'action2', type: 'action.validate', config: {
        schema: {
          type: 'object',
          properties: {
            rows: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'quantity'],
                additionalProperties: false
              }
            }
          },
          required: ['rows'],
          additionalProperties: false
        },
        data: '${nodes.action1.output.rows}'
      } },
    { id: 'condition1', type: 'condition', config: { leftPath: 'nodes.action2.output.valid', operator: 'equals', value: false } },
    { id: 'action3', type: 'action.notify', config: { message: 'CSV validation failed: ${nodes.action2.output.errors.join(\', \')}' } }
  ],
  edges: [
    { id: 'edge1', source: 'trigger1', target: 'action1' },
    { id: 'edge2', source: 'action1', target: 'action2' },
    { id: 'edge3', source: 'action2', target: 'condition1' },
    { id: 'edge4', source: 'condition1', target: 'action3' }
  ]
};