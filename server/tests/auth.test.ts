import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import User, { IUser } from '../src/models/User';

// Global MongoDB instance
let mongo: MongoMemoryServer;

// Connect to in-memory MongoDB before all tests
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);
});

// Close database connection and stop MongoMemoryServer after all tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

// Clear collections before each test
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

describe('Auth Endpoints', () => {
  // Seed a user directly via the User model
  const seedUser = async (overrides: Partial<IUser> = {}) => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'Password123!', // Will be hashed by pre-save hook
      role: 'viewer',
      ...overrides
    };
    const user = new User(userData);
    await user.save();
    return user;
  };

  describe('POST /api/auth/login', () => {
    it('should return 200 + accessToken + refreshToken + user object for valid credentials', async () => {
      await seedUser();

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('email', 'test@example.com');
      expect(res.body.user).toHaveProperty('name', 'Test User');
      expect(res.body.user).toHaveProperty('role', 'viewer');
    });

    it('should return 401 for wrong password', async () => {
      await seedUser();

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword'
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/register', () => {
    it('should create user with role viewer', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'New User',
          email: 'new@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(201); // Assuming we return 201 for created
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('email', 'new@example.com');
      expect(res.body.user).toHaveProperty('name', 'New User');
      expect(res.body.user).toHaveProperty('role', 'viewer');
    });
  });

  describe('Protected routes with RBAC', () => {
    // Helper function to login and get access token
    const getAccessTokenForUser = async (email: string, password: string): Promise<string> => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password });

      return res.body.accessToken;
    };

    it('should return 403 for workflow_builder when requireRole(\'super_admin\')', async () => {
      // Seed a workflow_builder user
      await seedUser({ email: 'builder@example.com', role: 'workflow_builder' });

      const res = await request(app)
        .get('/api/test/rbac')
        .set('Authorization', `Bearer ${await getAccessTokenForUser('builder@example.com', 'Password123!')}`);

      expect(res.status).toBe(403);
    });

    it('should return 200 for super_admin on same route', async () => {
      await seedUser({ email: 'admin@example.com', role: 'super_admin' });

      const res = await request(app)
        .get('/api/test/rbac')
        .set('Authorization', `Bearer ${await getAccessTokenForUser('admin@example.com', 'Password123!')}`);

      expect(res.status).toBe(200);
    });
  });
});