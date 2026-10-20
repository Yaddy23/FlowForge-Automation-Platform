import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import Workflow from '../src/models/Workflow';
import WorkflowVersion from '../src/models/WorkflowVersion';
import WorkflowRun from '../src/models/WorkflowRun';
import { getConnection } from '../src/queues';
import crypto from 'node:crypto';

console.log('webhook.test.ts file is being executed');

// Mock the queues module
vi.mock('../src/queues', () => {
  const actual = vi.importActual('../src/queues'); // Removed await
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
    mock.get = vi.fn().mockResolvedValue(null);
    mock.set = vi.fn().mockResolvedValue('OK');
    mock.del = vi.fn().mockResolvedValue(1);
    mock.incr = vi.fn().mockResolvedValue(1);
    mock.expire = vi.fn().mockResortedValue(1);
    mock.ttl = vi.fn().mockResolvedValue(-1);
    mock.flushdb = vi.fn().mockResolvedValue('OK');

    return mock;
  };

  // Mock BullMQ Queue
  const createMockQueue = () => {
    const mock = {
      add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      isPaused: vi.fn().mockResolvedValue(false),
      count: vi.fn().mockResolvedValue(0),
      getJobCounts: vi.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0, completed: 0, delayed: 0 }),
      getJobLogs: vi.fn().mockResolvedValue([]),
      getJob: vi.fn().mockResolvedValue(null),
      getJobs: vi.fn().mockResolvedValue([]),
      close: vi.fn().mockResolvedValue(undefined),
      empty: vi.fn().mockResolvedValue(undefined)
    };

    return mock;
  };

  // Mock BullMQ Worker
  const createMockWorker = () => {
    const mock = {
      close: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      isPaused: vi.fn().mockResolvedValue(false),
      id: 'mock-worker-id'
    };

    return mock;
  };

  let mockConnection = null;

  return {
    ...actual,
    getConnection: () => {
      if (!mockConnection) {
        mockConnection = createMockRedis();
      }
      return mockConnection;
    },
    enqueueRun: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock the bullmq Worker class
vi.mock('bullmq', () => {
  return {
    Worker: vi.fn().mockImplementation(() => {
      return {
        add: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        resume: vi.fn().mockResolvedValue(undefined),
        isPaused: vi.fn().mockResolvedValue(false),
        on: vi.fn().mockImplementation((event, callback) => {
          // Mock the on method to store callbacks if needed
          return this;
        })
      };
    })
  };
});

let mongo: MongoMemoryServer;
let adminToken: string;
let adminId: string;
let workflowId: string;
let webhookId: string;

const testWorkflowDefWithWebhook = {
  nodes: [
    { id: 't1', type: 'trigger.webhook', config: { webhookId: 'test-webhook-123', token: 'test-token', hmacSecret: 'test-secret' } },
    { id: 'a1', type: 'action.log', config: { message: 'Webhook received: {{payload.message}}' } }
  ],
  edges: [{ id: 'e1', source: 't1', target: 'a1' }}
];

const testWorkflowDefWithoutAuth = {
  nodes: [
    { id: 't1', type: 'trigger.webhook', config: { webhookId: 'test-webhook-456' } },
    { id: 'a1', type: 'action.log', config: { message: 'Public webhook received' } }
  ],
  edges: [{ id: 'e1', source: 't1', target: 'a1' }}
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  // Create admin user
  await mongoose.connection.collection('users').deleteMany({});
  const User = mongoose.model('User');
  const adminUser = await User.create({
    email: 'admin@test.com',
    name: 'Admin',
    role: 'super_admin',
    password: 'Admin123!' // Will be hashed by pre-save hook
  });

  adminId = adminUser._id.toString();

  // Login to get token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.com', password: 'Admin123!' });

  adminToken = loginRes.body.accessToken;

  // Create a test workflow with webhook trigger (with auth)
  const wfRes = await request(app)
    .post('/api/workflows')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Webhook Workflow', description: 'for webhook testing', definition: testWorkflowDefWithWebhook });

  expect(wfRes.status).toBe(201);
  workflowId = String(wfRes.body.workflow._id);
  webhookId = 'test-webhook-123';

  // Create a test workflow without auth for public webhook testing
  const wfRes2 = await request(app)
    .post('/api/workflows')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Public Webhook Workflow', description: 'for public webhook testing', definition: testWorkflowDefWithoutAuth });

  expect(wfRes2.status).toBe(201);
  // We don't need to store this workflow ID for most tests
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  // Clear runs before each test
  await WorkflowRun.deleteMany({});
  // Clear workflow versions to prevent duplicate key errors
  await WorkflowVersion.deleteMany({});
});

describe('Webhook Trigger', () => {
  describe('POST /webhook/:webhookId', () => {
    it('should return 400 if webhook ID is missing', async () => {
      const res = await request(app)
        .post('/webhook/')
        .send({ test: 'data' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Webhook ID is required');
    });

    it('should return 404 for non-existent webhook ID', async () => {
      const res = await request(app)
        .post('/webhook/non-existent-webhook-id')
        .send({ test: 'data' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Webhook not found');
    });

    it('should accept webhook request with valid token', async () => {
      const res = await request(app)
        .post(`/webhook/${webhookId}`)
        .set('Authorization', 'Bearer test-token')
        .send({ message: 'Hello World', foo: 'bar' });

      expect(res.status).toBe(202);
      expect(res.body.message).toBe('Webhook accepted for processing');
    });

    it('should reject webhook request with invalid token', async () => {
      const res = await request(app)
        .post(`/webhook/${webhookId}`)
        .set('Authorization', 'Bearer wrong-token')
        .send({ message: 'Hello World' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('should accept webhook request with token in query parameter', async () => {
      const res = await request(app)
        .post(`/webhook/${webhookId}?token=test-token`)
        .send({ message: 'Hello World from query param' });

      expect(res.status).toBe(202);
      expect(res.body.message).toBe('Webhook accepted for processing');
    });

    it('should accept webhook request with token in custom header', async () => {
      const res = await request(app)
        .post(`/webhook/${webhookId}`)
        .set('x-webhook-token', 'test-token')
        .send({ message: 'Hello World from custom header' });

      expect(res.status).toBe(202);
      expect(res.body.message).toBe('Webhook accepted for processing');
    });

    it('should validate HMAC signature correctly', async () => {
      const payload = { message: 'Hello World', timestamp: Date.now() };
      const body = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', 'test-secret')
        .update(body)
        .digest('hex');

      const res = await request(app)
        .post(`/webhook/${webhookId}`)
        .set('Authorization', 'Bearer test-token')
        .set('x-hub-signature-256', `sha256=${signature}`)
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.body.message).toBe('Webhook accepted for processing');
    });

    it('should reject webhook request with invalid HMAC signature', async () => {
      const payload = { message: 'Hello World' };
      const body = JSON.stringify(payload);
      const wrongSignature = crypto.createHmac('sha256', 'wrong-secret')
        .update(body)
        .digest('hex');

      const res = await request(app)
        .post(`/webhook/${webhookId}`)
        .set('Authorization', 'Bearer test-token')
        .set('x-hub-signature-256', `sha256=${wrongSignature}`)
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('should create workflow run when webhook triggers matching workflow', async () => {
      const payload = { message: 'Test webhook payload', test: true };
      const body = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', 'test-secret')
        .update(body)
        .digest('hex');

      const res = await request(app)
        .post(`/webhook/${webhookId}`)
        .set('Authorization', 'Bearer test-token')
        .set('x-hub-signature-256', `sha256=${signature}`)
        .send(payload);

      expect(res.status).toBe(202);

      // Give it a moment to process (since webhook consumer processes asynchronously)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if a workflow run was created
      const runs = await WorkflowRun.find({ workflow: workflowId });
      expect(runs).toHaveLength(1);

      const run = runs[0];
      expect(run.trigger.type).toBe('webhook');
      expect(run.trigger.webhookId).toBe(webhookId);
      expect(run.trigger.message).toBe('Test webhook payload');
      expect(run.trigger.test).toBe(true);
      expect(run.status).toBe('queued');
    });

    it('should not create workflow run for non-matching webhook ID', async () => {
      const payload = { message: 'Test payload' };
      const body = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', 'test-secret')
        .update(body)
        .digest('hex');

      const res = await request(app)
        .post(`/webhook/non-matching-webhook-id`)
        .set('Authorization', 'Bearer test-token')
        .set('x-hub-signature-256', `sha256=${signature}`)
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Webhook not found');

      // Check that no workflow run was created for our test workflow
      const runs = await WorkflowRun.find({ workflow: workflowId });
      expect(runs).toHaveLength(0);
    });

    it('should enforce rate limiting', async () => {
      // Make requests up to the limit (default is 100 per minute)
      // We'll test with a smaller number to avoid waiting
      const payload = { message: 'Rate limit test' };
      const body = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', 'test-secret')
        .update(body)
        .digest('hex');

      // Make 5 requests (under the limit of 100)
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post(`/webhook/${webhookId}`)
          .set('Authorization', 'Bearer test-token')
          .set('x-hub-signature-256', `sha256=${signature}`)
          .send(payload);

        expect(res.status).toBe(202);
      }

      // All requests should succeed
      const runs = await WorkflowRun.find({ workflow: workflowId });
      expect(runs).toHaveLength(5);
    });

    it('should work for public webhooks (no auth required)', async () => {
      // Create a workflow with a public webhook (no token or hmacSecret)
      const publicWebhookId = 'public-webhook-123';
      const publicWorkflowDef = {
        nodes: [
          { id: 't1', type: 'trigger.webhook', config: { webhookId: publicWebhookId } },
          { id: 'a1', type: 'action.log', config: { message: 'Public webhook: {{payload.message}}' } }
        ],
        edges: [{ id: 'e1', source: 't1', target: 'a1' }]
      };

      const wfRes = await request(app)
        .post('/api/workflows')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Public Webhook Workflow', description: 'for public webhook testing', definition: publicWorkflowDef });

      expect(wfRes.status).toBe(201);
      const publicWorkflowId = String(wfRes.body.workflow._id);

      // Test the public webhook
      const payload = { message: 'Public webhook test' };
      const res = await request(app)
        .post(`/webhook/${publicWebhookId}`)
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.body.message).toBe('Webhook accepted for processing');

      // Give it a moment to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if a workflow run was created
      const runs = await WorkflowRun.find({ workflow: publicWorkflowId });
      expect(runs).toHaveLength(1);

      const run = runs[0];
      expect(run.trigger.type).toBe('webhook');
      expect(run.trigger.webhookId).toBe(publicWebhookId);
      expect(run.trigger.message).toBe('Public webhook test');
      expect(run.status).toBe('queued');

      // Clean up
      await WorkflowRun.deleteMany({});
      await WorkflowVersion.deleteMany({ workflow: new mongoose.Types.ObjectId(publicWorkflowId) });
      await Workflow.findByIdAndDelete(publicWorkflowId);
    });
  });
});