import { Router } from 'express';
import { listCredentials, createCredential, getCredential, deleteCredential } from '../controllers/credentials.controller';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validate';
import { createCredentialSchema, objectIdSchema } from '../validation/schemas';

const router = Router();

router.use(requireAuth);

router.get('/', listCredentials);
router.post('/', validateBody(createCredentialSchema), createCredential);
router.get('/:id', validateParams(objectIdSchema), getCredential);
router.delete('/:id', validateParams(objectIdSchema), deleteCredential);

export default router;
