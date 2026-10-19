import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import User from '../src/models/User';

let mongo: MongoMemoryServer;

const manualDef = {
  nodes: [{ id: 't1', type: 'trigger.manual', config: {} }],
  edges: [],
};
const noTriggerDef = {
  nodes: [{ id: 'a1', type: 'action.log', config: { message: 'hi' } }],
  edges: [],
};

async function makeUser(email: string, role: string) {
  await new User({ email, name: email.split('@')[0], role, password: 'Password123!' }).save();
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

let builderA: { token: string; id: string };
let builderB: { token: string; id: string };
let admin: { token: string; id: string };
let viewer: { token: string; id: string };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.deleteMany({});
  builderA = await makeUser('a@flowforge.dev', 'workflow_builder');
  builderB = await makeUser('b@flowforge.dev', 'workflow_builder');
  admin = await makeUser('admin@flowforge.dev', 'workflow_admin');
  viewer = await makeUser('viewer@flowforge.dev', 'viewer');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('Workflow CRUD API', () => {
  it('builder creates a workflow → 201, draft, latestVersion 1', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${builderA.token}`)
      .send({ name: 'My Workflow', description: 'test', definition: manualDef });
    expect(res.status).toBe(201);
    expect(res.body.workflow.status).toBe('draft');
    expect(res.body.workflow.latestVersion).toBe(1);
    expect(res.body.workflow.owner).toBe(builderA.id);
  });

  it('viewer PATCH → 403', async () => {
    const created = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${builderA.token}`)
      .send({ name: 'W2', definition: manualDef });
    const id = created.body.workflow._id ?? created.body.workflow.id;
    const res = await request(app)
      .patch(`/api/workflows/${id}`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ name: 'hacked' });
    expect(res.status).toBe(403);
  });

  it('builder PATCH another builder’s workflow → 403', async () => {
    const created = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${builderA.token}`)
      .send({ name: 'W3', definition: manualDef });
    const id = created.body.workflow._id ?? created.body.workflow.id;
    const res = await request(app)
      .patch(`/api/workflows/${id}`)
      .set('Authorization', `Bearer ${builderB.token}`)
      .send({ name: 'stolen' });
    expect(res.status).toBe(403);
  });

  it('activate without passing validation → 422', async () => {
    const created = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${builderA.token}`)
      .send({ name: 'Bad', definition: noTriggerDef });
    const id = created.body.workflow._id ?? created.body.workflow.id;
    const versionId = created.body.version._id;
    const res = await request(app)
      .post(`/api/workflows/${id}/activate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ versionId });
    expect(res.status).toBe(422);
  });

  it('activate v1 then save draft → version 2 while active stays 1', async () => {
    const created = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${builderA.token}`)
      .send({ name: 'W5', definition: manualDef });
    const id = created.body.workflow._id ?? created.body.workflow.id;
    const versionId = created.body.version._id;

    const act = await request(app)
      .post(`/api/workflows/${id}/activate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ versionId });
    expect(act.status).toBe(200);
    expect(act.body.workflow.status).toBe('active');
    expect(act.body.workflow.activeVersion).toBe(1);

    const v2 = await request(app)
      .post(`/api/workflows/${id}/versions`)
      .set('Authorization', `Bearer ${builderA.token}`)
      .send({ definition: manualDef });
    expect(v2.status).toBe(201);
    expect(v2.body.version.version).toBe(2);

    const fetched = await request(app)
      .get(`/api/workflows/${id}`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.workflow.latestVersion).toBe(2);
    expect(fetched.body.workflow.activeVersion).toBe(1);
  });

  it('viewer can read the workflow list', async () => {
    const res = await request(app)
      .get('/api/workflows')
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
