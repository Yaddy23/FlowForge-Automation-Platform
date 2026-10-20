import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import { MongoClient } from 'mongodb';

// Mock the queues module and bullmq Worker
vi.mock('../src/queues', () => {
  return {
    getConnection: () => {
      const { EventEmitter } = require('events');
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
      mock.expire = vi.fn().mockResolvedValue(1);
      mock.ttl = vi.fn().mockResolvedValue(-1);
      mock.flushdb = vi.fn().mockResolvedValue('OK');

      return mock;
    },
    enqueueRun: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock the bullmq Worker and Queue classes
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
    }),
    Queue: vi.fn().mockImplementation(() => {
      return {
        add: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined)
      };
    })
  };
});

// Dayjs plugins must be loaded with dayjs.extend() — direct plugin calls
// expect (option, Dayjs, dayjsFactory) and throw on a dayjs argument.
import dayjs from 'dayjs';

// Now import the scheduler service after the mocks are set up
import { startSchedulerService, SchedulerService } from '../src/triggers/schedule';
import Workflow from '../src/models/Workflow';
import WorkflowVersion from '../src/models/WorkflowVersion';
import WorkflowRun from '../src/models/WorkflowRun';
import WorkflowSchedule from '../src/models/WorkflowSchedule';

let mongo: MongoMemoryServer;
let schedulerService: SchedulerService | null = null;
let adminToken: string;
let adminId: string;
let workflowId: string;

const testWorkflowDef = {
  nodes: [
    { id: 't1', type: 'trigger.manual', config: {} },
    { id: 'a1', type: 'action.log', config: { message: 'test' } }
  ],
  edges: [{ id: 'e1', source: 't1', target: 'a1' }]
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

  // Create a test workflow
  const wfRes = await request(app)
    .post('/api/workflows')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test Workflow', description: 'for scheduling', definition: testWorkflowDef });

  expect(wfRes.status).toBe(201);
  workflowId = String(wfRes.body.workflow._id);
});

afterAll(async () => {
  if (schedulerService) {
    await schedulerService.stop();
  }
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  // Clear schedules and runs before each test
  await WorkflowSchedule.deleteMany({});
  await WorkflowRun.deleteMany({});
  // Clear workflow versions to prevent duplicate key errors
  await WorkflowVersion.deleteMany({});

  // Clear mocks
  vi.clearAllMocks();
});

afterEach(async () => {
  // Clean up any remaining scheduler service
  if (schedulerService) {
    await schedulerService.stop();
    schedulerService = null;
  }
});

describe('Scheduler Service', () => {
  describe('startSchedulerService', () => {
    it('should start the scheduler service', async () => {
      schedulerService = await startSchedulerService();
      expect(schedulerService).toBeInstanceOf(SchedulerService);
      await schedulerService.stop();
    });
  });

  describe('shouldRunSchedule', () => {
    it('should correctly determine when an hourly schedule should run', async () => {
      schedulerService = new SchedulerService();

      // Create a test schedule
      const schedule = await WorkflowSchedule.create({
        workflow: new mongoose.Types.ObjectId(workflowId),
        type: 'hourly',
        enabled: true
      });

      const now = dayjs();

      // Should run if no nextRunAt (first run)
      let shouldRun = await schedulerService.shouldRunSchedule(schedule, now.toDate());
      expect(shouldRun).toBe(true);

      // Set nextRunAt to an hour ago
      schedule.nextRunAt = dayjs(now).subtract(1, 'hour').toDate();
      await schedule.save();

      shouldRun = await schedulerService.shouldRunSchedule(schedule, now.toDate());
      expect(shouldRun).toBe(true);

      // Set nextRunAt to in the future
      schedule.nextRunAt = dayjs(now).add(1, 'hour').toDate();
      await schedule.save();

      shouldRun = await schedulerService.shouldRunSchedule(schedule, now.toDate());
      expect(shouldRun).toBe(false);
    });
  });

  describe('executeScheduledWorkflow', () => {
    it('should create a workflow run when executing a scheduled workflow', async () => {
      schedulerService = new SchedulerService();

      // Get the workflow and its active version
      const workflow = await Workflow.findById(workflowId);
      expect(workflow).not.toBeNull();

      // For this test, we'll manually set up an active version
      const version = new WorkflowVersion({
        workflow: workflow._id,
        version: 1,
        definition: testWorkflowDef,
        createdBy: new mongoose.Types.ObjectId(adminId),
      });
      await version.save();

      workflow.activeVersion = version.version;
      workflow.status = 'active';
      await workflow.save();

      // Create a schedule
      const schedule = await WorkflowSchedule.create({
        workflow: workflow._id,
        type: 'once',
        enabled: true
      });

      // Execute the scheduled workflow
      await schedulerService.executeScheduledWorkflow(workflow, version, schedule);

      // Check that a run was created
      const runs = await WorkflowRun.find({ workflow: workflow._id });
      expect(runs).toHaveLength(1);

      const run = runs[0];
      expect(run.trigger.type).toBe('schedule');
      expect(run.trigger.scheduleId).toBe(schedule._id.toString());
      expect(run.status).toBe('queued');

      // Check that the schedule was updated
      const updatedSchedule = await WorkflowSchedule.findById(schedule._id);
      expect(updatedSchedule.enabled).toBe(false); // Once schedules should be disabled
    });
  });
});

describe('Schedule Routes', () => {
  describe('GET /api/workflows/:id/schedule', () => {
    it('should return a workflows schedule', async () => {
      // First create a schedule
      const scheduleRes = await request(app)
        .post(`/api/workflows/${workflowId}/schedule`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'hourly', enabled: true });

      expect(scheduleRes.status).toBe(200);

      // Then get it
      const getRes = await request(app)
        .get(`/api/workflows/${workflowId}/schedule`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.schedule).toBeDefined();
      expect(getRes.body.schedule?.type).toBe('hourly');
    });
  });

  describe('POST /api/workflows/:id/schedule', () => {
    it('should create a new schedule', async () => {
      const res = await request(app)
        .post(`/api/workflows/${workflowId}/schedule`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'daily', enabled: true, timezone: 'America/New_York' });

      expect(res.status).toBe(200);
      expect(res.body.schedule).toBeDefined();
      expect(res.body.schedule?.type).toBe('daily');
      expect(res.body.schedule?.timezone).toBe('America/New_York');
      expect(res.body.schedule?.enabled).toBe(true);
    });

    it('should validate cron expressions', async () => {
      const res = await request(app)
        .post(`/api/workflows/${workflowId}/schedule`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'cron', cron: 'invalid cron', enabled: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid cron expression');
    });

    it('should update an existing schedule', async () => {
      // Create initial schedule
      await request(app)
        .post(`/api/workflows/${workflowId}/schedule`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'hourly', enabled: true });

      // Update it
      const res = await request(app)
        .post(`/api/workflows/${workflowId}/schedule`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'weekly', enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.schedule?.type).toBe('weekly');
      expect(res.body.schedule?.enabled).toBe(false);
    });
  });

  describe('DELETE /api/workflows/:id/schedule', () => {
    it('should delete a schedule', async () => {
      // Create a schedule
      await request(app)
        .post(`/api/workflows/${workflowId}/schedule`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'monthly', enabled: true });

      // Delete it
      const res = await request(app)
        .delete(`/api/workflows/${workflowId}/schedule`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Schedule deleted successfully');

      // Verify it's gone
      const getRes = await request(app)
        .get(`/api/workflows/${workflowId}/schedule`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.body.schedule).toBeNull();
    });
  });
});