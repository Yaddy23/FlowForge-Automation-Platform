import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import { logAudit } from '../services/audit.service';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required')
});

// JWT settings
const JWT_ACCESS_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production'; // In production, use separate secret
const JWT_ACCESS_EXPIRES_IN = '15m';
const JWT_REFRESH_EXPIRES_IN = '7d';

/**
 * Generate access and refresh tokens
 */
const generateTokens = (user: any) => {
  const payload = { id: user._id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
};

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate input
    const parsedBody = registerSchema.parse(req.body);
    const { name, email, password } = parsedBody;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Create new user (role defaults to 'viewer')
    const user = new User({ name, email, password });
    await user.save();

    // Log audit
    await logAudit(user._id, 'USER_REGISTER', 'User', user._id, { email: user.email });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Return response (excluding password)
    const userResponse = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    res.status(201).json({
      accessToken,
      refreshToken,
      user: userResponse
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
};

/**
 * @route POST /api/auth/login
 * @desc Login user and return tokens
 * @access Public
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate input
    const parsedBody = loginSchema.parse(req.body);
    const { email, password } = parsedBody;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Log audit
    await logAudit(user._id, 'USER_LOGIN', 'User', user._id, { email: user.email });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Return response
    const userResponse = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    res.json({
      accessToken,
      refreshToken,
      user: userResponse
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
};

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public
 */
export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // Verify refresh token
    let payload: any;
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Find user by id
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Log audit (optional for token refresh)
    // await logAudit(user._id, 'TOKEN_REFRESH', 'User', user._id);

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // Return new tokens
    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};