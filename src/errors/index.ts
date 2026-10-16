/**
 * Base Application Error class with operational flag and HTTP status codes.
 */
export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public readonly isOperational: boolean = true;
  public readonly timestamp: string;

  constructor(
    message: string,
    public readonly code: string = 'INTERNAL_ERROR',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      ...(this.details !== undefined ? { details: this.details } : {})
    };
  }
}

/**
 * Thrown when an error occurs during database operations.
 */
export class DatabaseError extends AppError {
  public readonly statusCode: number = 500;
  public readonly sql?: string;
  public readonly sqlState?: string;
  public readonly errno?: number;
  public readonly sqlMessage?: string;

  constructor(
    message: string,
    options?: {
      code?: string;
      sql?: string;
      sqlState?: string;
      errno?: number;
      sqlMessage?: string;
      details?: unknown;
    }
  ) {
    super(message, options?.code ?? 'DATABASE_ERROR', options?.details);
    this.sql = options?.sql;
    this.sqlState = options?.sqlState;
    this.errno = options?.errno;
    this.sqlMessage = options?.sqlMessage;
  }
}

/**
 * Thrown when an authentication or authorization failure occurs.
 */
export class AuthError extends AppError {
  public override readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number = 401,
    code: string = 'UNAUTHORIZED',
    details?: unknown
  ) {
    super(message, code, details);
    this.statusCode = statusCode;
  }

  public static unauthorized(message = 'Authentication required'): AuthError {
    return new AuthError(message, 401, 'UNAUTHORIZED');
  }

  public static invalidToken(message = 'Invalid or malformed token'): AuthError {
    return new AuthError(message, 401, 'INVALID_TOKEN');
  }

  public static tokenExpired(message = 'Token has expired'): AuthError {
    return new AuthError(message, 401, 'TOKEN_EXPIRED');
  }

  public static forbidden(message = 'Insufficient permissions'): AuthError {
    return new AuthError(message, 403, 'FORBIDDEN');
  }

  public static invalidCredentials(message = 'Invalid email or password'): AuthError {
    return new AuthError(message, 401, 'INVALID_CREDENTIALS');
  }
}

/**
 * Thrown when request payload or query parameters fail validation.
 */
export class ValidationError extends AppError {
  public readonly statusCode: number = 400;

  constructor(
    message: string,
    public readonly validationErrors?: Record<string, string> | string[]
  ) {
    super(message, 'VALIDATION_ERROR', validationErrors);
  }
}
