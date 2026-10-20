import { createPool } from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { Router } from 'express';
import { BaseClient } from './BaseClient';
import { Transaction } from './Transaction';
import { createResourceRouter, type ResourceEngineOptions } from './ResourceEngine';
import { applySecureSSLProfile } from './ssl';
import {
  InstrumentationManager,
  TerminalLoggerInstrumentation,
  type PoolMetrics
} from './Instrumentation';
import { DatabaseError, PoolExhaustedError } from '../errors';
import type {
  DatabaseConfig,
  QueryExecutionOptions,
  TransactionOptions,
  HealthCheckResult
} from './types';

const TRANSIENT_NETWORK_ERRORS = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'
]);

const DEADLOCK_ERRORS = new Set([
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
  '1213',
  '1205'
]);

/**
 * Modern, enterprise-grade MySQL Database Client built on mysql2/promise.
 * Features bounded connection pool queues, idempotent full-jitter retries,
 * transaction deadlock retries, pluggable instrumentation, and instant CRUD routers.
 */
export class Database extends BaseClient {
  private readonly pool: Pool;
  private readonly instrumentationManager: InstrumentationManager;
  private readonly startTime = performance.now();
  private isDraining = false;

  public readonly config: DatabaseConfig;
  public readonly connectionLimit: number;
  public readonly queueLimit: number;

  constructor(config: DatabaseConfig) {
    // 1. Setup Instrumentation & Logging
    const manager = new InstrumentationManager();

    if (config.debug) {
      const debugOpts = typeof config.debug === 'object' ? config.debug : {};
      manager.addListener(
        new TerminalLoggerInstrumentation({
          slowThresholdMs: config.slowQueryThresholdMs ?? 500,
          sensitiveKeys: config.sensitiveKeys,
          ...debugOpts
        })
      );
    }

    if (config.instrumentation) {
      const listeners = Array.isArray(config.instrumentation)
        ? config.instrumentation
        : [config.instrumentation];
      for (const listener of listeners) {
        manager.addListener(listener);
      }
    }

    super(manager);
    this.instrumentationManager = manager;
    this.config = config;

    // 2. Bounded Connection Pool Queue Defaults
    this.connectionLimit = config.connectionLimit ?? 10;
    // Bounded queue: fail-fast when connectionLimit * 10 is reached instead of unbounded memory leak
    this.queueLimit = config.queueLimit ?? this.connectionLimit * 10;

    const {
      debug: _debug,
      instrumentation: _instrumentation,
      slowQueryThresholdMs: _slowQueryThresholdMs,
      retryPolicy: _retryPolicy,
      retryAttempts: _retryAttempts,
      retryDelayMs: _retryDelayMs,
      sensitiveKeys: _sensitiveKeys,
      useAwsRds: _useAwsRds,
      ...driverPoolOptions
    } = config;

    const poolConfig = {
      waitForConnections: true,
      connectionLimit: this.connectionLimit,
      queueLimit: this.queueLimit,
      maxIdle: this.connectionLimit,
      idleTimeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      ...driverPoolOptions
    };

    this.pool = createPool(poolConfig);
  }

  protected getExecutor(): Pool {
    if (this.isDraining) {
      throw new DatabaseError('Database pool is currently draining and cannot accept new queries.');
    }
    return this.pool;
  }

  /**
   * Check if an error was caused by pool queue saturation or exhaustion.
   */
  private isPoolExhausted(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || '').toLowerCase();
    const code = String(err.code || '');

    return (
      code === 'ER_CON_COUNT_ERROR' ||
      code === 'POOL_ENQUEUE_TIMEOUT' ||
      msg.includes('pool is full') ||
      msg.includes('queue limit reached') ||
      msg.includes('timeout waiting for connection')
    );
  }

  /**
   * Check if an error is a deadlock or lock wait timeout.
   */
  private isDeadlock(err: any): boolean {
    if (!err) return false;
    return (
      DEADLOCK_ERRORS.has(String(err.code)) ||
      DEADLOCK_ERRORS.has(String(err.errno))
    );
  }

  /**
   * Check if an error is a transient network blip.
   */
  private isTransientNetwork(err: any): boolean {
    if (!err) return false;
    return (
      TRANSIENT_NETWORK_ERRORS.has(String(err.code)) ||
      TRANSIENT_NETWORK_ERRORS.has(String(err.errno))
    );
  }

  /**
   * Calculate exponential backoff delay with Full Jitter:
   * delay = Math.random() * (baseDelay * 2^(attempt - 1))
   */
  private calculateJitterDelay(
    attempt: number,
    baseDelayMs: number = 200,
    maxDelayMs: number = 3000
  ): number {
    const exponential = baseDelayMs * Math.pow(2, attempt - 1);
    const capped = Math.min(exponential, maxDelayMs);
    // Full jitter distributes retries uniformly across [0, capped]
    return Math.floor(Math.random() * capped);
  }

  /**
   * Safe, idempotent query execution wrapper with exponential backoff and full jitter.
   */
  protected override async runWithPolicy<T>(
    operation: () => Promise<T>,
    isRead: boolean,
    options?: QueryExecutionOptions
  ): Promise<T> {
    const maxAttempts =
      this.config.retryPolicy?.maxAttempts ?? this.config.retryAttempts ?? 3;
    const baseDelay =
      this.config.retryPolicy?.baseDelayMs ?? this.config.retryDelayMs ?? 200;
    const maxDelay = this.config.retryPolicy?.maxDelayMs ?? 3000;

    let attempt = 0;

    while (true) {
      try {
        return await operation();
      } catch (err: any) {
        attempt++;

        // 1. Fast-fail on pool queue exhaustion with HTTP 503
        if (this.isPoolExhausted(err)) {
          throw new PoolExhaustedError(
            `Database connection pool queue exhausted (${this.queueLimit} limit reached). Server is temporarily saturated.`,
            err
          );
        }

        const isDeadlock = this.isDeadlock(err);
        const isNetwork = this.isTransientNetwork(err);

        // Safe retry eligibility rules:
        // - Deadlocks are always safe to retry
        // - Network transient errors are retryable for reads (SELECT) or if explicitly marked idempotent
        const isRetryable =
          isDeadlock ||
          (isNetwork && (isRead || options?.idempotent === true));

        if (isRetryable && attempt <= maxAttempts) {
          const delay = this.calculateJitterDelay(attempt, baseDelay, maxDelay);

          this.instrumentationManager.onRetry?.({
            attempt,
            maxAttempts,
            delayMs: delay,
            error: err,
            isDeadlock,
            operationType: isRead ? 'read' : 'write'
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw err;
      }
    }
  }

  /**
   * Execute an atomic transaction with automatic rollback and deadlock retries.
   *
   * @param action Scoped transaction execution callback
   * @param options Transaction retry configuration
   */
  public async transaction<T>(
    action: (trx: Transaction) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const maxRetries = options?.retries ?? 3;
    const baseDelay = options?.retryDelayMs ?? 200;
    let attempt = 0;

    while (true) {
      attempt++;
      let conn: PoolConnection | null = null;
      let threadId: number | string = '';

      try {
        try {
          conn = await this.pool.getConnection();
          threadId = (conn as any).threadId ?? '';
        } catch (acquireErr: any) {
          if (this.isPoolExhausted(acquireErr)) {
            throw new PoolExhaustedError('Failed to acquire connection for transaction: pool exhausted.');
          }
          throw acquireErr;
        }

        this.instrumentationManager.onTransaction?.('START', threadId);
        await conn.beginTransaction();

        const trx = new Transaction(conn, this.instrumentationManager);
        const result = await action(trx);

        await conn.commit();
        this.instrumentationManager.onTransaction?.('COMMIT', threadId);
        return result;
      } catch (err: any) {
        if (conn) {
          try {
            await conn.rollback();
            this.instrumentationManager.onTransaction?.('ROLLBACK', threadId);
          } catch (rollbackErr) {
            console.error('[Database] Rollback failure:', rollbackErr);
          }
        }

        const isDeadlock = this.isDeadlock(err);
        if (isDeadlock && attempt <= maxRetries) {
          const delay = this.calculateJitterDelay(attempt, baseDelay, 3000);
          this.instrumentationManager.onRetry?.({
            attempt,
            maxAttempts: maxRetries,
            delayMs: delay,
            error: err,
            isDeadlock: true,
            operationType: 'transaction'
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (err instanceof DatabaseError) {
          throw err;
        }

        throw new DatabaseError(`Transaction failed: ${err.message}`, {
          code: err.code ?? 'TRANSACTION_FAILED',
          details: err
        });
      } finally {
        if (conn) {
          conn.release();
        }
      }
    }
  }

  /**
   * Instant CRUD Resource Router generator.
   * Generates a fully featured, secure Express router with pagination, sorting, search, and auth.
   */
  public createResourceRouter(table: string, options?: ResourceEngineOptions): Router {
    return createResourceRouter(this, table, options);
  }

  /**
   * Inspect current connection pool metrics.
   */
  public getPoolMetrics(): PoolMetrics {
    const internal = this.pool as any;
    return {
      totalConnections: internal.pool?._allConnections?.length ?? 0,
      activeConnections: internal.pool?._acquiringConnections?.length ?? 0,
      idleConnections: internal.pool?._freeConnections?.length ?? 0,
      queuedRequests: internal.pool?._connectionQueue?.length ?? 0
    };
  }

  /**
   * Process liveness check: verifies process health and uptime.
   */
  public liveness(): { alive: boolean; uptimeSeconds: number } {
    return {
      alive: !this.isDraining,
      uptimeSeconds: Math.floor((performance.now() - this.startTime) / 1000)
    };
  }

  /**
   * Database readiness check: verifies MySQL connectivity and pool saturation.
   */
  public async readiness(): Promise<{
    ready: boolean;
    latencyMs: number;
    pool: PoolMetrics;
    error?: string;
  }> {
    const start = performance.now();
    const pool = this.getPoolMetrics();

    try {
      await this.pool.query('SELECT 1');
      const latencyMs = Number((performance.now() - start).toFixed(2));
      const ready = pool.queuedRequests < this.queueLimit;

      return {
        ready,
        latencyMs,
        pool
      };
    } catch (err: any) {
      const latencyMs = Number((performance.now() - start).toFixed(2));
      return {
        ready: false,
        latencyMs,
        pool,
        error: err.message
      };
    }
  }

  /**
   * Comprehensive health check combining liveness and readiness.
   */
  public async healthCheck(): Promise<HealthCheckResult> {
    const live = this.liveness();
    const ready = await this.readiness();

    let status: HealthCheckResult['status'] = 'healthy';
    if (!ready.ready) {
      status = 'unhealthy';
    } else if (ready.pool.queuedRequests > 0 || ready.latencyMs > 250) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      liveness: live,
      readiness: ready
    };
  }

  /**
   * Graceful drain and shutdown for process termination (SIGTERM / SIGINT).
   * Rejects new queries immediately and waits for active connections to drain before closing pool.
   */
  public async drain(timeoutMs: number = 5000): Promise<void> {
    this.isDraining = true;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Database drain timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    try {
      await Promise.race([this.pool.end(), timeoutPromise]);
    } catch (err) {
      console.warn('[Database] Error or timeout during graceful drain:', err);
    }
  }

  /**
   * Close the pool immediately.
   */
  public async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Retrieve underlying mysql2 Pool instance.
   */
  public getPool(): Pool {
    return this.pool;
  }

  /**
   * Asynchronously constructs a Database instance with automatic SSL profile
   * resolution (e.g. lazy-loading AWS RDS CA cert bundles on demand).
   *
   * @param config - Database configuration options.
   * @returns Ready-to-use Database instance.
   */
  public static async create(config: DatabaseConfig): Promise<Database> {
    const resolvedConfig = await applySecureSSLProfile(config);
    return new Database(resolvedConfig);
  }
}

/**
 * Factory function to create a Database client instance.
 *
 * For cloud deployments with `useAwsRds: true`, consider `await Database.create(config)`
 * to asynchronously load the AWS RDS SSL bundle via code-splitting.
 */
export function createDbClient(config: DatabaseConfig): Database {
  return new Database(config);
}
