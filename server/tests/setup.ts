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