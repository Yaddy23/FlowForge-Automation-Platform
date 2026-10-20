import { Router } from 'express';
import { listCredentials, createCredential, getCredential, deleteCredential } from '../controllers/credentials.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', listCredentials);
router.post('/', createCredential);
router.get('/:id', getCredential);
router.delete('/:id', deleteCredential);

export default router;