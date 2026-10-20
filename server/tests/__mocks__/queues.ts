// Mock queues module for testing
const { EventEmitter } = require('events');

// Mock Redis client
const createMockRedis = () => {
  const mock = new EventEmitter();
  mock.connected = true;
  mock.connect = () => Promise.resolve();
  mock.quit = () => Promise.resolve();
  mock.disconnect = () => Promise.resolve();
  mock.on = mock.addListener.bind(mock);
  mock.once = mock.once.bind(mock);
  mock.off = mock.removeListener.bind(mock);
  mock.removeListener = mock.removeListener.bind(mock);
  mock.removeAllListeners = mock.removeAllListeners.bind(mock);
  mock.setMaxListeners = mock.setMaxListeners.bind(mock);
  mock.getMaxListeners = mock.getMaxListeners.bind(mock);

  // Mock methods used by BullMQ
  mock.get = jest.fn().mockResolvedValue(null);
  mock.set = jest.fn().mockResolvedValue('OK');
  mock.del = jest.fn().mockResolvedValue(1);
  mock.incr = jest.fn().mockResolvedValue(1);
  mock.expire = jest.fn().mockResolvedValue(1);
  mock.ttl = jest.fn().mockResolvedValue(-1);
  mock.flushdb = jest.fn().mockResolvedValue('OK');

  return mock;
};

// Mock BullMQ Queue
const createMockQueue = () => {
  const mock = {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    isPaused: jest.fn().mockResolvedValue(false),
    count: jest.fn().mockResolvedValue(0),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0, completed: 0, delayed: 0 }),
    getJobLogs: jest.fn().mockResolvedValue([]),
    getJob: jest.fn().mockResolvedValue(null),
    getJobs: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
    empty: jest.fn().mockResolvedValue goal: 'mock'
  };

  return mock;
};

// Mock BullMQ Worker
const createMockWorker = () => {
  const mock = {
    close: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    isPaused: jest.fn().mockResolvedValue(false),
    id: 'mock-worker-id'
  };

  return mock;
};

let mockRedis = null;
let mockRunQueue = null;
let mockEventsQueue = null;
let mockConnection = null;

module.exports = {
  __esModule: true,
  ...jest.requireActual('../src/queues/index.ts'),
  getConnection: () => {
    if (!mockConnection) {
      mockConnection = createMockRedis();
    }
    return mockConnection;
  },
  getRunQueue: () => {
    if (!mockRunQueue) {
      mockRunQueue = createMockQueue();
    }
    return mockRunQueue;
  },
  getEventsQueue: () => {
    if (!mockEventsQueue) {
      mockEventsQueue = createMockQueue();
    }
    return mockEventsQueue;
  },
  enqueueRun: jest.fn().mockResolvedValue(undefined),
  startRunWorker: jest.fn().mockResolvedValue(createMockWorker()),
  closeQueues: jest.fn().mockResolvedValue(undefined),
  RUN_QUEUE_NAME: 'mock-workflow-runs',
  EVENTS_QUEUE_NAME: 'mock-workflow-events',
  connection: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    flushdb: jest.fn()
  }
};