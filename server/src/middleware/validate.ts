import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Validates req.body against a Zod schema. On failure returns 400 with
 * flattened field errors. `strip` removes unknown keys.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const { fieldErrors } = result.error.flatten();
      return res.status(400).json({
        error: 'Validation failed',
        details: fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

/** Validates req.query against a Zod schema (parses as strings/numbers). */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const { fieldErrors } = result.error.flatten();
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: fieldErrors,
      });
    }
    next();
  };
}

/** Validates req.params against a Zod schema (e.g. mongo ObjectId shape). */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const { fieldErrors } = result.error.flatten();
      return res.status(400).json({
        error: 'Invalid path parameters',
        details: fieldErrors,
      });
    }
    next();
  };
}

export function zodErrorResponse(error: ZodError): { error: string; details: unknown } {
  return { error: 'Validation failed', details: error.flatten().fieldErrors };
}
