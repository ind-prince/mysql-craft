import { TerminalLoggerInstrumentation } from './Instrumentation';
import type { LoggerConfig } from './Instrumentation';

/**
 * Backward-compatible Logger export.
 * Delegates to TerminalLoggerInstrumentation with formatted query logging,
 * SQL syntax highlighting, and parameter credential masking.
 */
export class Logger extends TerminalLoggerInstrumentation {
  constructor(options?: boolean | LoggerConfig) {
    if (typeof options === 'boolean') {
      super({ slowThresholdMs: 500, maskSensitive: true });
    } else {
      super(options);
    }
  }

  /**
   * Log executed SQL query with duration and parameters.
   */
  public logQuery(
    sql: string,
    params: unknown[] = [],
    durationMs: number,
    rowsAffectedOrCount?: number
  ): void {
    this.onQuery({
      sql,
      params: params as any[],
      durationMs,
      rowCount: rowsAffectedOrCount
    });
  }

  /**
   * Log transaction lifecycle events.
   */
  public logTransaction(
    action: 'START' | 'COMMIT' | 'ROLLBACK',
    connectionId?: number | string
  ): void {
    this.onTransaction(action, connectionId);
  }

  /**
   * Log database execution or connection error.
   */
  public logError(error: Error | any, sql?: string, params?: unknown[]): void {
    this.onError({
      error,
      sql,
      params: params as any[]
    });
  }
}
