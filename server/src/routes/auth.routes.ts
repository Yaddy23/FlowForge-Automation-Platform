import { Router } from 'express';
import { register, login, refresh } from '../controllers/auth.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { authLimiter } from '../middleware/security';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(2048),
});

// Public endpoints — rate limited and schema-validated
router.post('/register', authLimiter, validateBody(registerSchema), register);
router.post('/login', authLimiter, validateBody(loginSchema), login);
router.post('/refresh', authLimiter, validateBody(refreshSchema), refresh);

export default router;
