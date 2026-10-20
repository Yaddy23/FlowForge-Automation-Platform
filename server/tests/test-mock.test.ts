import { describe, it, expect, vi } from 'vitest';
import { getEventsQueue } from '../src/queues';

describe('mock test', () => {
  it('should return a queue from getEventsQueue', () => {
    const queue = getEventsQueue();
    expect(queue).toBeDefined();
    expect(queue.add).toBeTypeOf('function');
  });
});