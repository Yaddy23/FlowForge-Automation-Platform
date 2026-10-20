import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Allowed origins for CORS. In production, CLIENT_ORIGIN must be set;
 * in dev/test, localhost Vite dev server origins are allowed.
 */
function allowedOrigins(): string[] {
  const origins: string[] = [];
  if (process.env.CLIENT_ORIGIN) {
    origins.push(...process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean));
  }
  if (isDev) {
    origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }
  return origins;
}

export function applySecurityMiddleware(app: Express): void {
  // Security headers
  app.use(
    helmet({
      // Swagger UI needs to load its assets and inline scripts
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // CORS: allow configured origins; same-origin/no-origin requests (curl, server-to-server) pass
  const origins = allowedOrigins();
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || origins.length === 0 || origins.includes(origin)) {
          return cb(null, true);
        }
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );

  // JSON body limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
}

/** General API rate limit: 300 requests / 15 min per IP (no-op in test env). */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many requests, please try again later' },
});

/** Stricter rate limit for auth endpoints: 20 attempts / 15 min per IP (no-op in test env). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many authentication attempts, please try again later' },
});
