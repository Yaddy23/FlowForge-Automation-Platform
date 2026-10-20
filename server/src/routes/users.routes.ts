import { Router } from 'express';
import {
  getUsersHandler,
  getUserByIdHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
} from '../controllers/user.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  createUserSchema,
  updateUserSchema,
  objectIdSchema,
  listQuerySchema,
} from '../validation/schemas';

const router = Router();

// All user routes require authentication + super_admin role
router.use(requireAuth, requireRole('super_admin'));

router.get('/', validateQuery(listQuerySchema), getUsersHandler);
router.get('/:id', validateParams(objectIdSchema), getUserByIdHandler);
router.post('/', validateBody(createUserSchema), createUserHandler);
router.put('/:id', validateParams(objectIdSchema), validateBody(updateUserSchema), updateUserHandler);
router.delete('/:id', validateParams(objectIdSchema), deleteUserHandler);

export default router;
