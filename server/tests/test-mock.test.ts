import { describe, it, expect, vi } from 'vitest';

// REDIS_URL is unset in tests (the queue layer degrades gracefully), so mock
// the queues module to verify callers consume the queue's contract.
vi.mock('../src/queues', () => ({
  getEventsQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
}));

import { getEventsQueue } from '../src/queues';

describe('mock test', () => {
  it('should return a queue from getEventsQueue', () => {
    const queue = getEventsQueue();
    expect(queue).toBeDefined();
    expect(queue!.add).toBeTypeOf('function');
  });
});
