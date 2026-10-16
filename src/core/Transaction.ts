import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { Logger } from './Logger';
import { DatabaseError } from '../errors';
import type { InsertResult, UpdateResult, DeleteResult } from './types';

/**
 * Encapsulates an active MySQL transaction on a dedicated connection.
 */
export class Transaction {
  constructor(
    public readonly connection: PoolConnection,
    private readonly logger: Logger
  ) {}

  /**
   * Escape an identifier (table name or column name) with backticks.
   */
  private escapeIdentifier(identifier: string): string {
    if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
      throw new DatabaseError(`Invalid database identifier: "${identifier}". Identifiers must be alphanumeric.`);
    }
    return `\`${identifier}\``;
  }

  /**
   * Execute a parameterized SELECT or data-fetching query within this transaction.
   */
  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const start = performance.now();
    try {
      const [rows] = await this.connection.query<RowDataPacket[] & T[]>(sql, params);
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
  }

  /**
   * Execute a query and return only the first row, or null if no matching records found.
   */
  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 && rows[0] !== undefined ? rows[0] : null;
  }

  /**
   * Execute a mutation query (INSERT, UPDATE, DELETE) and return the raw ResultSetHeader.
   */
  public async execute(sql: string, params: any[] = []): Promise<ResultSetHeader> {
    const start = performance.now();
    try {
      const [result] = await this.connection.execute<ResultSetHeader>(sql, params);
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
  }

  /**
   * Type-safe, parameterized insertion helper. Prevents SQL injection by automatically
   * parameterizing values and escaping table & column identifiers.
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

    const placeholders = `(${columns.map(() => '?').join(', ')})`;
    const allPlaceholders = items.map(() => placeholders).join(', ');

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
   * Type-safe parameterized update helper.
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
   * Type-safe parameterized delete helper.
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
}
