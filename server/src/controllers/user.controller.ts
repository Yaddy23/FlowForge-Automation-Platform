import { Request, Response, NextFunction } from 'express';
import User from '../models/User';

/**
 * GET /api/users
 * Get all users with pagination (super admin only)
 */
export const getUsersHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only super admins can view all users
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { limit, page, search, role } = req.query;
    const limitNum = limit ? parseInt(limit as string, 10) : 50;
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const skip = (pageNum - 1) * limitNum;

    // Build match criteria
    const match: any = {};

    if (search) {
      match.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      match.role = role;
    }

    const [users, totalCount] = await Promise.all([
      User.find(match)
        .select('-password') // Exclude password from results
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(match)
    ]);

    res.json({
      users,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:id
 * Get a specific user by ID (super admin only)
 */
export const getUserByIdHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only super admins can view users
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const user = await User.findById(id).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users
 * Create a new user (super admin only)
 */
export const createUserHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only super admins can create users
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { email, name, password, role } = req.body;

    if (!email || !name || !password || !role) {
      return res.status(400).json({ error: 'Email, name, password, and role are required' });
    }

    // Validate role
    const validRoles = ['super_admin', 'workflow_admin', 'workflow_builder', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Create user — the model's pre-save hook hashes the password, so pass
    // the plaintext here (hashing first would double-hash and break login)
    const user = await User.create({
      email,
      name,
      password,
      role
    });

    // Create default preferences for the new user
    const { getUserPreferences } = await import('../services/userPreferences.service');
    await getUserPreferences(user._id);

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: (user.toObject() as { createdAt?: Date }).createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/users/:id
 * Update a user (super admin only)
 */
export const updateUserHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only super admins can update users
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { name, role } = req.body;

    // Validate role if provided
    if (role) {
      const validRoles = ['super_admin', 'workflow_admin', 'workflow_builder', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
    }

    const user = await User.findByIdAndUpdate(
      id,
      {
        ...(name && { name }),
        ...(role && { role })
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/users/:id
 * Delete a user (super admin only)
 */
export const deleteUserHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only super admins can delete users
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    // Prevent deleting oneself
    if (id === req.user?.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // TODO: Also delete user's notifications, preferences, etc.

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
};