import { Router } from 'express';
import { register, login, refresh } from '../controllers/auth.controller';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Public endpoints
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);

// Example protected route for testing (can be removed or moved elsewhere)
// router.get('/protected', requireAuth, (req, res) => {
//   res.json({ message: 'Protected route accessed', user: req.user });
// });

// Example role-protected route for testing
// router.get('/admin', requireAuth, requireRole('super_admin'), (req, res) => {
//   res.json({ message: 'Admin route accessed', user: req.user });
// });

export default router;