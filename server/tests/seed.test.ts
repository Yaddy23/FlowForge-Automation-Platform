import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { seedDemoUsers } from '../src/scripts/seed';
import User from '../src/models/User';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('seedDemoUsers', () => {
  it('creates the 4 demo accounts with correct roles', async () => {
    const emails = await seedDemoUsers();
    expect(emails).toHaveLength(4);

    const admin = await User.findOne({ email: 'admin@flowforge.dev' });
    expect(admin?.role).toBe('super_admin');
    const wfadmin = await User.findOne({ email: 'wfadmin@flowforge.dev' });
    expect(wfadmin?.role).toBe('workflow_admin');
    const builder = await User.findOne({ email: 'builder@flowforge.dev' });
    expect(builder?.role).toBe('workflow_builder');
    const viewer = await User.findOne({ email: 'viewer@flowforge.dev' });
    expect(viewer?.role).toBe('viewer');
  });

  it('is idempotent: a second run does not duplicate accounts', async () => {
    await seedDemoUsers();
    await seedDemoUsers();
    expect(await User.countDocuments()).toBe(4);
  });

  it('stores hashed passwords that verify against Demo123!', async () => {
    await seedDemoUsers();
    const admin = await User.findOne({ email: 'admin@flowforge.dev' });
    expect(admin?.password).not.toBe('Demo123!');
    expect(await admin?.comparePassword('Demo123!')).toBe(true);
  });
});