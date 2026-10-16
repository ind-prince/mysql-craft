import { createPool } from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { Logger } from './Logger';
import { Transaction } from './Transaction';
import { DatabaseError } from '../errors';
import type {
  DatabaseConfig,
  InsertResult,
  UpdateResult,
  DeleteResult,
  HealthCheckResult
} from './types';

const TRANSIENT_ERROR_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ER_CON_COUNT_ERROR',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT'
]);

/**
 * Modern, safe, lightweight MySQL client wrapper built on top of mysql2/promise.
 */
export class Database {
  private readonly pool: Pool;
  private readonly logger: Logger;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  public readonly config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.logger = new Logger(config.debug);
    this.retryAttempts = config.retryAttempts ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 300;

    // Default pool configuration best-practices
    const poolConfig: DatabaseConfig = {
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      ...config
    };

    this.pool = createPool(poolConfig);
  }

  /**
   * Escape an identifier (table name or column name) with backticks safely.
   */
  private escapeIdentifier(identifier: string): string {
    if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
      throw new DatabaseError(
        `Invalid database identifier: "${identifier}". Identifiers must be alphanumeric and underscore only.`
      );
    }
    return `\`${identifier}\``;
  }

  /**
   * Execute an operation with automatic retry logic for transient connection drops and deadlocks.
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (err: any) {
        attempt++;
        const isTransient =
          TRANSIENT_ERROR_CODES.has(err.code) ||
          TRANSIENT_ERROR_CODES.has(err.errno?.toString());

        if (isTransient && attempt <= this.retryAttempts) {
          const backoff = this.retryDelayMs * Math.pow(2, attempt - 1);
          console.warn(
            `[Database] Transient error (${err.code}). Retrying attempt ${attempt}/${this.retryAttempts} in ${backoff}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        throw err;
      }
    }
  }

  /**
   * Execute a parameterized SELECT or data-retrieval query.
   * Prevents SQL injection by enforcing parameter binding.
   */
  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.executeWithRetry(async () => {
      const start = performance.now();
      try {
        const [rows] = await this.pool.query<RowDataPacket[] & T[]>(sql, params);
        const duration = performance.now() - start;
        this.logger.logQuery(sql, params, duration, Array.isArray(rows) ? rows.length : undefined);
        return rows as T[];
      } catch (err: any) {
        const duration = performance.now() - start;
        this.logger.logError(err, sql, params);
        throw new DatabaseError(err.message, {
          code: err.code,
          sql,
          sqlState: err.sqlState,
          errno: err.errno,
          sqlMessage: err.sqlMessage,
          details: { durationMs: duration }
        });
      }
    });
  }

  /**
   * Execute a query and return only the first record, or null if no matching records found.
   */
  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 && rows[0] !== undefined ? rows[0] : null;
  }

  /**
   * Execute a raw mutation query (INSERT, UPDATE, DELETE) and return the raw ResultSetHeader.
   */
  public async execute(sql: string, params: any[] = []): Promise<ResultSetHeader> {
    return this.executeWithRetry(async () => {
      const start = performance.now();
      try {
        const [result] = await this.pool.execute<ResultSetHeader>(sql, params);
        const duration = performance.now() - start;
        this.logger.logQuery(sql, params, duration, result.affectedRows);
        return result;
      } catch (err: any) {
        const duration = performance.now() - start;
        this.logger.logError(err, sql, params);
        throw new DatabaseError(err.message, {
          code: err.code,
          sql,
          sqlState: err.sqlState,
          errno: err.errno,
          sqlMessage: err.sqlMessage,
          details: { durationMs: duration }
        });
      }
    });
  }

  /**
   * Safe, parameterized insert helper for single or bulk records.
   * Automatically handles column extraction, identifier escaping, and placeholder mapping.
   *
   * @example
   * await db.insert('users', { name: 'Alice', email: 'alice@example.com' });
   */
  public async insert<TRecord extends Record<string, any>>(
    table: string,
    records: TRecord | TRecord[]
  ): Promise<InsertResult> {
    const items = Array.isArray(records) ? records : [records];
    if (items.length === 0) {
      return { insertId: 0, affectedRows: 0 };
    }

    const firstItem = items[0];
    if (!firstItem) {
      return { insertId: 0, affectedRows: 0 };
    }

    const columns = Object.keys(firstItem);
    if (columns.length === 0) {
      throw new DatabaseError(`Cannot insert empty record into table "${table}".`);
    }

    const escapedTable = this.escapeIdentifier(table);
    const escapedColumns = columns.map((col) => this.escapeIdentifier(col)).join(', ');

    const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
    const allPlaceholders = items.map(() => rowPlaceholder).join(', ');

    const sql = `INSERT INTO ${escapedTable} (${escapedColumns}) VALUES ${allPlaceholders}`;
    const values: unknown[] = [];

    for (const item of items) {
      for (const col of columns) {
        values.push(item[col] !== undefined ? item[col] : null);
      }
    }

    const result = await this.execute(sql, values);
    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows
    };
  }

  /**
   * Safe, parameterized update helper.
   *
   * @example
   * await db.update('users', { status: 'active' }, 'id = ?', [userId]);
   */
  public async update<TData extends Record<string, any>>(
    table: string,
    data: TData,
    whereClause: string,
    whereParams: unknown[] = []
  ): Promise<UpdateResult> {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      throw new DatabaseError(`Cannot update table "${table}" with empty data payload.`);
    }

    const escapedTable = this.escapeIdentifier(table);
    const setStatements = keys.map((key) => `${this.escapeIdentifier(key)} = ?`).join(', ');
    const sql = `UPDATE ${escapedTable} SET ${setStatements} WHERE ${whereClause}`;

    const values = keys.map((key) => data[key]);
    const allParams = [...values, ...whereParams];

    const result = await this.execute(sql, allParams);
    return {
      affectedRows: result.affectedRows,
      changedRows: result.changedRows ?? result.affectedRows
    };
  }

  /**
   * Safe parameterized delete helper.
   *
   * @example
   * await db.delete('sessions', 'expired_at < NOW()');
   */
  public async delete(
    table: string,
    whereClause: string,
    whereParams: unknown[] = []
  ): Promise<DeleteResult> {
    const escapedTable = this.escapeIdentifier(table);
    const sql = `DELETE FROM ${escapedTable} WHERE ${whereClause}`;
    const result = await this.execute(sql, whereParams);
    return {
      affectedRows: result.affectedRows
    };
  }

  /**
   * Execute an atomic transaction with automatic commit and rollback handling.
   * If any error is thrown within the callback, the transaction is automatically rolled back
   * and the connection is safely returned to the pool.
   *
   * @example
   * const result = await db.transaction(async (trx) => {
   *   const order = await trx.insert('orders', { total: 100 });
   *   await trx.insert('order_items', { order_id: order.insertId, item_id: 42 });
   *   return order;
   * });
   */
  public async transaction<T>(action: (trx: Transaction) => Promise<T>): Promise<T> {
    const conn: PoolConnection = await this.pool.getConnection();
    const trx = new Transaction(conn, this.logger);
    const threadId = (conn as any).threadId;

    try {
      this.logger.logTransaction('START', threadId);
      await conn.beginTransaction();

      const result = await action(trx);

      await conn.commit();
      this.logger.logTransaction('COMMIT', threadId);
      return result;
    } catch (err: any) {
      try {
        await conn.rollback();
        this.logger.logTransaction('ROLLBACK', threadId);
      } catch (rollbackErr) {
        console.error('[Database] Failed to rollback transaction:', rollbackErr);
      }

      if (err instanceof DatabaseError) {
        throw err;
      }

      throw new DatabaseError(`Transaction failed: ${err.message}`, {
        code: err.code ?? 'TRANSACTION_FAILED',
        sqlMessage: err.sqlMessage,
        details: err
      });
    } finally {
      conn.release();
    }
  }

  /**
   * Check connection health, test ping latency, and report pool stats.
   */
  public async healthCheck(): Promise<HealthCheckResult> {
    const start = performance.now();
    try {
      await this.pool.query('SELECT 1');
      const latencyMs = Number((performance.now() - start).toFixed(2));
      const poolInternal = this.pool as any;

      return {
        status: 'healthy',
        latencyMs,
        timestamp: new Date().toISOString(),
        pool: {
          totalConnections: poolInternal.pool?._allConnections?.length ?? 0,
          activeConnections: poolInternal.pool?._acquiringConnections?.length ?? 0,
          idleConnections: poolInternal.pool?._freeConnections?.length ?? 0,
          queuedRequests: poolInternal.pool?._connectionQueue?.length ?? 0
        }
      };
    } catch (err: any) {
      const latencyMs = Number((performance.now() - start).toFixed(2));
      return {
        status: 'unhealthy',
        latencyMs,
        timestamp: new Date().toISOString(),
        error: err.message,
        pool: {
          totalConnections: 0,
          activeConnections: 0,
          idleConnections: 0,
          queuedRequests: 0
        }
      };
    }
  }

  /**
   * Gracefully terminate the database pool and wait for all active connections to drain.
   */
  public async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Retrieve the underlying mysql2 Pool instance if low-level operations are needed.
   */
  public getPool(): Pool {
    return this.pool;
  }
}

/**
 * Factory function to create a new modern Database client instance.
 */
export function createDbClient(config: DatabaseConfig): Database {
  return new Database(config);
}
