import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import User from '../src/models/User';
import Workflow from '../src/models/Workflow';
import WorkflowVersion from '../src/models/WorkflowVersion';
import WorkflowRun from '../src/models/WorkflowRun';

/** Shared engine/API test scaffolding (mongodb-memory-server + JWT login). */

export async function startMongo(): Promise<MongoMemoryServer> {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  return mongo;
}

export async function stopMongo(mongo: MongoMemoryServer): Promise<void> {
  await mongoose.disconnect();
  await mongo.stop();
}

export async function makeUser(email: string, role: string): Promise<{ token: string; id: string }> {
  await new User({ email, name: email.split('@')[0], role, password: 'Password123!' }).save();
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

export async function createActiveWorkflow(
  ownerId: string,
  definition: unknown
): Promise<string> {
  const wf = await Workflow.create({
    name: 'Test workflow',
    owner: ownerId,
    status: 'active',
    latestVersion: 1,
    activeVersion: 1,
  });
  await WorkflowVersion.create({
    workflow: wf._id,
    version: 1,
    definition,
    createdBy: ownerId,
  });
  return String(wf._id);
}

export async function createRun(
  workflowId: string,
  ownerId: string,
  payload: unknown,
  opts: { timeoutMs?: number } = {}
): Promise<string> {
  const run = await WorkflowRun.create({
    workflow: workflowId,
    workflowVersion: 1,
    status: 'queued',
    trigger: { type: 'manual', payload },
    idempotencyKey: randomUUID(),
    createdBy: ownerId,
    timeoutMs: opts.timeoutMs ?? 300000,
  });
  return String(run._id);
}

export const nodeRunsOf = async (runId: string) =>
  (mongoose.models.WorkflowNodeRun as mongoose.Model<unknown>).find({ run: runId }).lean();
