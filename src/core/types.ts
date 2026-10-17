import type { PoolOptions, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Instrumentation, LoggerConfig, PoolMetrics } from './Instrumentation';

export type { LoggerConfig, PoolMetrics, Instrumentation } from './Instrumentation';
export type { SelectQueryOptions, ParsedQueryParams } from './sql';

/**
 * Retry policy configuration for queries and transactions.
 */
export interface RetryPolicyOptions {
  /**
   * Maximum retry attempts for transient read errors or deadlocks.
   * Default: 3
   */
  maxAttempts?: number;

  /**
   * Base delay before backoff in milliseconds.
   * Default: 200ms
   */
  baseDelayMs?: number;

  /**
   * Maximum backoff ceiling in milliseconds.
   * Default: 3000ms
   */
  maxDelayMs?: number;

  /**
   * Whether to apply full jitter to backoff calculation.
   * Default: true
   */
  jitter?: boolean;
}

/**
 * Options for individual query execution.
 */
export interface QueryExecutionOptions {
  /**
   * If true, enables automatic retries on transient errors for this mutation.
   * By default, only idempotent operations (SELECT) and deadlocks are retried.
   */
  idempotent?: boolean;
}

/**
 * Options for executing an atomic transaction with automatic retries.
 */
export interface TransactionOptions {
  /**
   * Number of times to retry the entire transaction block on deadlock (1213 / 1205).
   * Default: 3
   */
  retries?: number;

  /**
   * Base delay between transaction retries in milliseconds.
   * Default: 200ms
   */
  retryDelayMs?: number;
}

/**
 * Configuration options for the Database client.
 */
export interface DatabaseConfig extends PoolOptions {
  /**
   * Enable terminal query logging or pass custom logger options.
   * Default: false
   */
  debug?: boolean | LoggerConfig;

  /**
   * Custom instrumentation listeners for metrics, APM, or custom loggers.
   */
  instrumentation?: Instrumentation | Instrumentation[];

  /**
   * Slow query threshold in milliseconds.
   * Default: 500ms
   */
  slowQueryThresholdMs?: number;

  /**
   * Automatic retry policy for queries.
   */
  retryPolicy?: RetryPolicyOptions;

  /**
   * Backoff retry attempts for backward compatibility (maps to retryPolicy.maxAttempts).
   */
  retryAttempts?: number;

  /**
   * Backoff delay in ms for backward compatibility (maps to retryPolicy.baseDelayMs).
   */
  retryDelayMs?: number;

  /**
   * Field names to mask in console query logs.
   */
  sensitiveKeys?: string[];
}

/**
 * Result returned by .insert() operations.
 */
export interface InsertResult {
  insertId: number;
  affectedRows: number;
}

/**
 * Result returned by .update() operations.
 */
export interface UpdateResult {
  affectedRows: number;
  changedRows: number;
}

/**
 * Result returned by .delete() operations.
 */
export interface DeleteResult {
  affectedRows: number;
}

/**
 * Standard paginated list result.
 */
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Comprehensive health check result combining liveness and readiness states.
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  liveness: {
    alive: boolean;
    uptimeSeconds: number;
  };
  readiness: {
    ready: boolean;
    latencyMs: number;
    pool: PoolMetrics;
    error?: string;
  };
}

/**
 * Helper alias for standard MySQL row data.
 */
export type DatabaseRow = RowDataPacket;

/**
 * Re-export mysql2 result set header for convenience.
 */
export type { ResultSetHeader };
