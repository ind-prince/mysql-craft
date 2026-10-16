// Core Database & Transactions
export { Database, createDbClient } from './core/Database';
export { Transaction } from './core/Transaction';
export { Logger } from './core/Logger';
export * from './core/types';

// Security & Authentication
export { Security } from './security/Auth';
export * from './security/types';

// Error Hierarchy
export {
  AppError,
  DatabaseError,
  AuthError,
  ValidationError
} from './errors';

// Web Middleware (Express)
export {
  authenticateJwt,
  requireRole,
  validateBody,
  errorMiddleware,
  type ExpressAuthOptions
} from './middleware/expressAuth';
