import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import { Security } from '../security/Auth';
import { AuthError, ValidationError, AppError } from '../errors';
import type { BaseTokenPayload } from '../security/types';

// Augment Express Request interface with typed user property
declare global {
  namespace Express {
    interface Request {
      user?: BaseTokenPayload & Record<string, any>;
    }
  }
}

export interface ExpressAuthOptions {
  /**
   * Secret key used to verify the JWT token.
   */
  secret: string;

  /**
   * If true, allows requests without a token to proceed (req.user will be undefined).
   * Default: false
   */
  optional?: boolean;

  /**
   * Custom token extractor function if not using standard Authorization: Bearer header.
   */
  tokenExtractor?: (req: Request) => string | null;
}

/**
 * Standard token extractor looking for Bearer token in Authorization header.
 */
function defaultBearerExtractor(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer') {
    return parts[1] ?? null;
  }
  return null;
}

/**
 * Express middleware to authenticate requests using JWT tokens.
 * Automatically verifies tokens, handles expiration, and populates `req.user`.
 *
 * @example
 * app.get('/profile', authenticateJwt({ secret: process.env.JWT_SECRET! }), (req, res) => {
 *   res.json({ user: req.user });
 * });
 */
export function authenticateJwt(options: ExpressAuthOptions): RequestHandler {
  const extractor = options.tokenExtractor ?? defaultBearerExtractor;

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const token = extractor(req);

      if (!token) {
        if (options.optional) {
          return next();
        }
        return next(AuthError.unauthorized('Authorization Bearer token is required.'));
      }

      const decoded = Security.verifyToken<BaseTokenPayload>(token, options.secret);
      req.user = decoded;
      return next();
    } catch (err) {
      if (options.optional) {
        return next();
      }
      return next(err);
    }
  };
}

/**
 * Role-Based Access Control (RBAC) middleware.
 * Ensures the authenticated user has at least one of the required roles.
 *
 * @example
 * app.delete('/users/:id', authenticateJwt({ secret }), requireRole('admin', 'superadmin'), handler);
 */
export function requireRole(...allowedRoles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AuthError.unauthorized('Authentication required to verify permissions.'));
    }

    const userRole = req.user.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return next(
        AuthError.forbidden(
          `Access forbidden: required role [${allowedRoles.join(', ')}], current role is "${userRole ?? 'none'}".`
        )
      );
    }

    return next();
  };
}

/**
 * Lightweight request body validation middleware.
 * Compatible with any custom validator or schema library (Zod, Joi, Yup, etc.).
 *
 * @example
 * app.post('/register', validateBody((body) => {
 *   if (!body.email) return { valid: false, errors: { email: 'Email is required' } };
 *   return { valid: true };
 * }), handler);
 */
export function validateBody(
  validator: (body: unknown) => { valid: boolean; errors?: Record<string, string> | string[] }
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = validator(req.body);
    if (!result.valid) {
      return next(new ValidationError('Request payload validation failed.', result.errors));
    }
    return next();
  };
}

/**
 * Standard centralized Express error-handling middleware for the library's error hierarchy.
 * Formats errors into a unified API response structure.
 */
export const errorMiddleware: ErrorRequestHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        name: err.name,
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {})
      }
    });
    return;
  }

  // Unhandled / native errors
  console.error('[UnhandledError]', err);
  res.status(500).json({
    success: false,
    error: {
      name: 'InternalServerError',
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message
    }
  });
};
