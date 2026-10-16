import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  buildSelectQuery,
  buildCountQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  type SelectQueryOptions,
  type CountQueryOptions,
  type ParsedQueryParams
} from './sql';
import { DatabaseError } from '../errors';
import type {
  InsertResult,
  UpdateResult,
  DeleteResult,
  PaginatedResult,
  QueryExecutionOptions
} from './types';
import type { Instrumentation } from './Instrumentation';

/**
 * Shared abstract base executor inherited by both Database (Pool) and Transaction (Connection).
 * Encapsulates parameterized query execution, high-level CRUD builders, and instrumentation.
 */
export abstract class BaseClient {
  constructor(protected readonly instrumentation: Instrumentation) {}

  /**
   * Returns the underlying mysql2 queryable (Pool or active PoolConnection).
   */
  protected abstract getExecutor(): Promise<Pool | PoolConnection> | (Pool | PoolConnection);

  /**
   * Internal hook to allow subclasses (like Database) to inject retry policies.
   */
  protected async runWithPolicy<T>(
    operation: () => Promise<T>,
    _isRead: boolean,
    _options?: QueryExecutionOptions
  ): Promise<T> {
    return operation();
  }

  /**
   * Execute a parameterized SELECT query.
   */
  public async query<T = any>(
    sql: string,
    params: any[] = [],
    options?: QueryExecutionOptions
  ): Promise<T[]> {
    return this.runWithPolicy(
      async () => {
        const executor = await this.getExecutor();
        const start = performance.now();
        try {
          const [rows] = await executor.query<RowDataPacket[] & T[]>(sql, params);
          const duration = performance.now() - start;
          const count = Array.isArray(rows) ? rows.length : undefined;

          this.instrumentation.onQuery?.({
            sql,
            params,
            durationMs: duration,
            rowCount: count
          });

          return rows as T[];
        } catch (err: any) {
          const duration = performance.now() - start;
          this.instrumentation.onError?.({
            error: err,
            sql,
            params,
            durationMs: duration
          });

          throw new DatabaseError(err.message, {
            code: err.code,
            sql,
            sqlState: err.sqlState,
            errno: err.errno,
            sqlMessage: err.sqlMessage,
            details: { durationMs: duration }
          });
        }
      },
      true,
      options
    );
  }

  /**
   * Execute a query and return only the first row, or null if no matching records found.
   */
  public async queryOne<T = any>(
    sql: string,
    params: any[] = [],
    options?: QueryExecutionOptions
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params, options);
    return rows.length > 0 && rows[0] !== undefined ? rows[0] : null;
  }

  /**
   * Execute a mutation query (INSERT, UPDATE, DELETE) and return the raw ResultSetHeader.
   */
  public async execute(
    sql: string,
    params: any[] = [],
    options?: QueryExecutionOptions
  ): Promise<ResultSetHeader> {
    return this.runWithPolicy(
      async () => {
        const executor = await this.getExecutor();
        const start = performance.now();
        try {
          const [result] = await executor.execute<ResultSetHeader>(sql, params);
          const duration = performance.now() - start;

          this.instrumentation.onQuery?.({
            sql,
            params,
            durationMs: duration,
            rowCount: result.affectedRows
          });

          return result;
        } catch (err: any) {
          const duration = performance.now() - start;
          this.instrumentation.onError?.({
            error: err,
            sql,
            params,
            durationMs: duration
          });

          throw new DatabaseError(err.message, {
            code: err.code,
            sql,
            sqlState: err.sqlState,
            errno: err.errno,
            sqlMessage: err.sqlMessage,
            details: { durationMs: duration }
          });
        }
      },
      false,
      options
    );
  }

  /**
   * High-level parameterized INSERT helper for single or bulk records.
   */
  public async insert<TRecord extends Record<string, any>>(
    table: string,
    records: TRecord | TRecord[],
    options?: QueryExecutionOptions
  ): Promise<InsertResult> {
    const items = Array.isArray(records) ? records : [records];
    if (items.length === 0) {
      return { insertId: 0, affectedRows: 0 };
    }

    const { sql, params } = buildInsertQuery(table, items);
    const result = await this.execute(sql, params, options);

    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows
    };
  }

  /**
   * High-level parameterized UPDATE helper.
   */
  public async update<TData extends Record<string, any>>(
    table: string,
    data: TData,
    whereClause: string,
    whereParams: any[] = [],
    options?: QueryExecutionOptions
  ): Promise<UpdateResult> {
    const { sql, params } = buildUpdateQuery(table, data, whereClause, whereParams);
    const result = await this.execute(sql, params, options);

    return {
      affectedRows: result.affectedRows,
      changedRows: result.changedRows ?? result.affectedRows
    };
  }

  /**
   * High-level parameterized DELETE helper.
   */
  public async delete(
    table: string,
    whereClause: string,
    whereParams: any[] = [],
    options?: QueryExecutionOptions
  ): Promise<DeleteResult> {
    const { sql, params } = buildDeleteQuery(table, whereClause, whereParams);
    const result = await this.execute(sql, params, options);

    return {
      affectedRows: result.affectedRows
    };
  }

  /**
   * High-level structured SELECT helper.
   */
  public async select<T = any>(
    options: SelectQueryOptions,
    queryOpts?: QueryExecutionOptions
  ): Promise<T[]> {
    const { sql, params } = buildSelectQuery(options);
    return this.query<T>(sql, params, queryOpts);
  }

  /**
   * High-level structured COUNT helper.
   */
  public async count(
    options: CountQueryOptions,
    queryOpts?: QueryExecutionOptions
  ): Promise<number> {
    const { sql, params } = buildCountQuery(options);
    const result = await this.queryOne<{ total: number }>(sql, params, queryOpts);
    return Number(result?.total ?? 0);
  }

  /**
   * Automatic pagination query executor combining filtered total count and sliced data records.
   */
  public async paginate<T = any>(
    table: string,
    queryParams: ParsedQueryParams,
    queryOpts?: QueryExecutionOptions
  ): Promise<PaginatedResult<T>> {
    const whereConditions = Object.keys(queryParams.filters).length > 0 ? queryParams.filters : undefined;

    // 1. Fetch total count
    const total = await this.count(
      {
        table,
        where: whereConditions,
        search: queryParams.search
      },
      queryOpts
    );

    // 2. Fetch page slice
    const data = await this.select<T>(
      {
        table,
        fields: queryParams.fields,
        where: whereConditions,
        search: queryParams.search,
        orderBy: queryParams.orderBy,
        limit: queryParams.limit,
        offset: queryParams.offset
      },
      queryOpts
    );

    const totalPages = Math.ceil(total / queryParams.limit) || 1;

    return {
      data,
      meta: {
        total,
        page: queryParams.page,
        limit: queryParams.limit,
        totalPages,
        hasNext: queryParams.page < totalPages,
        hasPrev: queryParams.page > 1
      }
    };
  }
}
