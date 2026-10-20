import { Router } from 'express';
import {
  getUsersHandler,
  getUserByIdHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler
} from '../controllers/user.controller';
import { RequireAuth } from '../middleware/requireAuth';

const router = Router();

// All user routes require authentication
router.use(RequireAuth);

// Get all users (super admin only)
router.get('/', getUsersHandler);

// Get a specific user by ID (super admin only)
router.get('/:id', getUserByIdHandler);

// Create a new user (super admin only)
router.post('/', createUserHandler);

// Update a user (super admin only)
router.put('/:id', updateUserHandler);

// Delete a user (super admin only)
router.delete('/:id', deleteUserHandler);

export default router;