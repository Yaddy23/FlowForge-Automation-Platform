import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import User from '../src/models/User';
import Workflow from '../src/models/Workflow';
import WorkflowVersion from '../src/models/WorkflowVersion';

let mongo: MongoMemoryServer;
let adminToken: string;
let adminId: string;
let workflowId: string;

const v1Def = {
  nodes: [
    { id: 't1', type: 'trigger.manual', config: {} },
    { id: 'a1', type: 'action.log', config: { message: 'hello' } }
  ],
  edges: [{ id: 'e1', source: 't1', target: 'a1' }]
};

const v2Def = {
  nodes: [
    { id: 't1', type: 'trigger.manual', config: {} },
    { id: 'a1', type: 'action.log', config: { message: 'hello world' } } // changed message
  ],
  edges: [{ id: 'e1', source: 't1', target: 'a1' }]
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.deleteMany({});
  const admin = await User.create({
    email: 'admin@flowforge.dev',
    name: 'Admin',
    role: 'workflow_admin',
    password: 'Password123!'
  });
  adminId = String(admin._id);
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@flowforge.dev', password: 'Password123!' });
  adminToken = loginRes.body.accessToken as string;

  // create workflow with v1 definition
  const wfRes = await request(app)
    .post('/api/workflows')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test Workflow', description: 'for versioning', definition: v1Def });
  expect(wfRes.status).toBe(201);
  workflowId = String(wfRes.body.workflow._id);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('Version diff and restore API', () => {
  it('should fail before implementation', async () => {
    // This test will initially fail because the endpoint does not exist
    const res = await request(app)
      .get(`/api/workflows/${workflowId}/versions/1/diff/2`)
      .set('Authorization', `Bearer ${adminToken}`);
    // Expect 404 (not found) or 500 if error
    expect(res.status).toBe(404);
  });

  it('activate v1, edit to v2, diff shows change', async () => {
    // Activate version 1
    const v1VersionId = (await WorkflowVersion.findOne({ workflow: workflowId, version: 1 }))._id;
    const actRes = await request(app)
      .post(`/api/workflows/${workflowId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ versionId: v1VersionId });
    expect(actRes.status).toBe(200);
    expect(actRes.body.workflow.activeVersion).toBe(1);

    // Create draft version 2 by saving a new version
    const versionRes = await request(app)
      .post(`/api/workflows/${workflowId}/versions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition: v2Def });
    expect(versionRes.status).toBe(201);
    expect(versionRes.body.version.version).toBe(2);
    // Expect latestVersion to be 2
    const wfRes = await request(app)
      .get(`/api/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(wfRes.body.workflow.latestVersion).toBe(2);
    expect(wfRes.body.workflow.activeVersion).toBe(1);
  });

  it('restore v1 creates new draft identical to v1, active unchanged', async () => {
    // Ensure we are at latest version 2 (draft) and active version 1
    const wfRes = await request(app)
      .get(`/api/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    console.log(`[RESTORE TEST] workflowId: ${workflowId}, latestVersion: ${wfRes.body.workflow.latestVersion}, activeVersion: ${wfRes.body.workflow.activeVersion}`);
    expect(wfRes.body.workflow.latestVersion).toBe(2);
    expect(wfRes.body.workflow.activeVersion).toBe(1);

    // Call restore endpoint for version 1
    const restoreRes = await request(app)
      .post(`/api/workflows/${workflowId}/versions/1/restore`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(201); // created new draft version
    // Expect latestVersion to be 3 (new draft)
    const wfRes2 = await request(app)
      .get(`/api/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    console.log(`[RESTORE TEST] After restore call, latestVersion: ${wfRes2.body.workflow.latestVersion}, activeVersion: ${wfRes2.body.workflow.activeVersion}`);
    expect(wfRes2.body.workflow.latestVersion).toBe(3);
    expect(wfRes2.body.workflow.activeVersion).toBe(1);

    // Fetch definition of version 3 and compare to v1Def
    const v3 = await WorkflowVersion.findOne({ workflow: workflowId, version: 3 });
    expect(v3).toBeDefined();
    // The definition should equal v1Def (deep equal)
    expect(v3.definition).toEqual(v1Def);
  });
});