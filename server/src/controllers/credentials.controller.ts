import { Request, Response, NextFunction } from 'express';
import { CredentialsService } from '../services/credentials.service';

/**
 * @route GET /api/credentials
 * @desc List all credentials for the current user (metadata only)
 */
export const listCredentials = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const credentials = await CredentialsService.listCredentialsByUser(
      req.user!.id
    );
    res.json(credentials);
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/credentials
 * @desc Create a new encrypted credential
 */
export const createCredential = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, credentialType, value } = req.body;

    if (!name || !credentialType || !value) {
      res.status(400).json({
        error: 'Name, credential type, and value are required',
      });
      return;
    }

    const credential = await CredentialsService.createCredential(
      name,
      credentialType,
      value,
      req.user!.id
    );

    // Return only metadata, never the decryptable data
    res.status(201).json({
      id: credential._id,
      name: credential.name,
      credentialType: credential.credentialType,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/credentials/:id
 * @desc Get a specific credential (metadata only)
 */
export const getCredential = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const credential = await CredentialsService.getCredentialByNameAndUser(
      req.params.id,
      req.user!.id
    );

    if (!credential) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    res.json(credential);
  } catch (error) {
    next(error);
  }
};

/**
 * @route DELETE /api/credentials/:id
 * @desc Delete a credential
 */
export const deleteCredential = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const deleted = await CredentialsService.deleteCredential(
      req.params.id,
      req.user!.id
    );

    if (!deleted) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    res.json({ message: 'Credential deleted successfully' });
  } catch (error) {
    next(error);
  }
};