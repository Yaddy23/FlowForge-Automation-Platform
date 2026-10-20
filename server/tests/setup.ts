// Load environment variables from .env if present
import * as dotenv from 'dotenv';
dotenv.config();

// Ensure NODE_ENV is set to test
if (process.env.NODE_ENV === undefined) {
  process.env.NODE_ENV = 'test';
}

// Set a default JWT secret for testing if not provided
if (process.env.JWT_SECRET === undefined) {
  process.env.JWT_SECRET = 'test-jwt-secret';
}

// For testing, we'll mock the Redis connection to avoid needing a real Redis server
if (process.env.NODE_ENV === 'test') {
  // Mock ioredis to return a mock Redis client
  const RedisMock = require('redis-mock');
  // We need to mock the IORedis constructor used in queues/index.ts
  // This is a bit tricky because we need to mock it before the queues module is loaded

  // Set REDIS_URL to a dummy value - the actual connection will be mocked
  if (process.env.REDIS_URL === undefined) {
    process.env.REDIS_URL = 'redis://mock:6379';
  }
}