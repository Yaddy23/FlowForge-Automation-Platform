import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import Workflow from '../src/models/Workflow';
import WorkflowVersion from '../src/models/WorkflowVersion>;
import WorkflowRun from '../src/models/WorkflowRun';
import { getEventsQueue } from '../src/queues';

describe('test with imports', () => {
  beforeAll(async () => {
    const mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('should pass', () => {
    expect(true).toBe(true);
  });
});