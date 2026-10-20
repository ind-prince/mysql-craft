// Core Database, Transactions, and Base Client
export { Database, createDbClient } from './core/Database';
export { BaseClient } from './core/BaseClient';
export { Transaction } from './core/Transaction';
export { Logger } from './core/Logger';
export * from './core/types';

// Instant CRUD Resource Engine
export {
  createResourceRouter,
  type ResourceEngineOptions,
  type ResourceHooks
} from './core/ResourceEngine';

// SQL Builders and Sanitizers
export {
  escapeIdentifier,
  buildSelectQuery,
  buildCountQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  parseQueryParams,
  type SelectQueryOptions,
  type CountQueryOptions,
  type ParsedQueryParams,
  type QueryParseOptions,
  type WhereCondition,
  type OrderByCondition
} from './core/sql';

// Instrumentation & Parameter Sanitizer
export {
  InstrumentationManager,
  TerminalLoggerInstrumentation,
  ParameterSanitizer,
  type Instrumentation,
  type QueryEvent,
  type ErrorEvent,
  type RetryEvent,
  type PoolMetrics,
  type MaskingOptions
} from './core/Instrumentation';

// Security & Authentication
export { Security } from './security/Auth';
export * from './security/types';

// Error Hierarchy
export {
  AppError,
  DatabaseError,
  PoolExhaustedError,
  AuthError,
  ValidationError
} from './errors';

// Zero-byte Native Encoding Utilities
export {
  safeDecodeBuffer,
  safeEncodeString
} from './core/encoding';

// Cloud TLS Infrastructure (AWS RDS)
export {
  applySecureSSLProfile
} from './core/ssl';

// Web Middleware (Express)
export {
  authenticateJwt,
  requireRole,
  validateBody,
  errorMiddleware,
  type ExpressAuthOptions
} from './middleware/expressAuth';

