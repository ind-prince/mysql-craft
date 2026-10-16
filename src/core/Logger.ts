import pc from 'picocolors';
import type { LoggerConfig } from './types';

const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'refreshtoken',
  'accesstoken',
  'jwt',
  'credit_card',
  'card_number',
  'cvv',
  'hash',
  'salt'
];

/**
 * Modern, human-readable terminal logger for MySQL query execution and lifecycle events.
 */
export class Logger {
  private enabled: boolean;
  private maskSensitive: boolean;
  private maxSqlLength: number;
  private slowThresholdMs: number;
  private sensitiveKeys: Set<string>;

  constructor(options?: boolean | LoggerConfig) {
    if (typeof options === 'boolean') {
      this.enabled = options;
      this.maskSensitive = true;
      this.maxSqlLength = 1000;
      this.slowThresholdMs = 500;
      this.sensitiveKeys = new Set(DEFAULT_SENSITIVE_KEYS);
    } else {
      this.enabled = options?.enabled ?? false;
      this.maskSensitive = options?.maskSensitiveParams ?? true;
      this.maxSqlLength = options?.maxSqlLength ?? 1000;
      this.slowThresholdMs = options?.slowThresholdMs ?? 500;
      this.sensitiveKeys = new Set([
        ...DEFAULT_SENSITIVE_KEYS,
        ...(options?.sensitiveKeys ?? []).map((k) => k.toLowerCase())
      ]);
    }
  }

  /**
   * Log an executed SQL query with duration, bindings, and results.
   */
  public logQuery(
    sql: string,
    params: unknown[] = [],
    durationMs: number,
    rowsAffectedOrCount?: number
  ): void {
    if (!this.enabled) return;

    const isSlow = durationMs >= this.slowThresholdMs;
    const timestamp = pc.dim(new Date().toLocaleTimeString());
    const badge = isSlow
      ? pc.bgYellow(pc.black(' SLOW QUERY '))
      : pc.bgCyan(pc.black(' MYSQL '));

    const durationText = this.formatDuration(durationMs);
    const highlightedSql = this.highlightSql(sql);

    console.log(`\n${badge} ${timestamp}  ${durationText}`);
    console.log(`  ${pc.bold('SQL:')}    ${highlightedSql}`);

    if (params && params.length > 0) {
      const sanitized = this.sanitizeParams(params);
      console.log(`  ${pc.bold('Params:')} ${pc.dim(JSON.stringify(sanitized))}`);
    }

    if (rowsAffectedOrCount !== undefined) {
      console.log(
        `  ${pc.bold('Result:')} ${pc.magenta(`${rowsAffectedOrCount} row(s)`)}`
      );
    }
  }

  /**
   * Log transaction lifecycle events (Start, Commit, Rollback).
   */
  public logTransaction(
    action: 'START' | 'COMMIT' | 'ROLLBACK',
    connectionId?: number | string
  ): void {
    if (!this.enabled) return;

    const timestamp = pc.dim(new Date().toLocaleTimeString());
    const connInfo = connectionId ? pc.dim(` [Conn #${connectionId}]`) : '';

    let badge = '';
    switch (action) {
      case 'START':
        badge = pc.bgBlue(pc.white(' TX:START '));
        break;
      case 'COMMIT':
        badge = pc.bgGreen(pc.black(' TX:COMMIT '));
        break;
      case 'ROLLBACK':
        badge = pc.bgRed(pc.white(' TX:ROLLBACK '));
        break;
    }

    console.log(`${badge} ${timestamp}${connInfo} Transaction ${action.toLowerCase()}ed.`);
  }

  /**
   * Log database execution or connection error.
   */
  public logError(
    error: Error | any,
    sql?: string,
    params?: unknown[]
  ): void {
    if (!this.enabled) return;

    const timestamp = pc.dim(new Date().toLocaleTimeString());
    const badge = pc.bgRed(pc.white(' DB ERROR '));

    console.error(`\n${badge} ${timestamp} ${pc.red(pc.bold(error.message))}`);

    if (sql) {
      console.error(`  ${pc.bold('Failed SQL:')} ${pc.yellow(sql)}`);
    }

    if (params && params.length > 0) {
      const sanitized = this.sanitizeParams(params);
      console.error(`  ${pc.bold('Params:')}     ${pc.dim(JSON.stringify(sanitized))}`);
    }

    if (error.code) {
      console.error(`  ${pc.bold('Code:')}       ${pc.red(error.code)}`);
    }
    if (error.errno) {
      console.error(`  ${pc.bold('Errno:')}      ${error.errno}`);
    }
    if (error.sqlState) {
      console.error(`  ${pc.bold('SQLState:')}   ${error.sqlState}`);
    }
  }

  /**
   * Format execution duration with color coding according to latency thresholds.
   */
  private formatDuration(durationMs: number): string {
    const formatted = `${durationMs.toFixed(2)}ms`;
    if (durationMs < 50) {
      return pc.green(`⚡ ${formatted}`);
    } else if (durationMs < 200) {
      return pc.yellow(`⏱  ${formatted}`);
    } else {
      return pc.red(pc.bold(`🐢 ${formatted} [SLOW]`));
    }
  }

  /**
   * Syntax highlights SQL keywords in terminal with color.
   */
  private highlightSql(sql: string): string {
    const cleaned = sql.replace(/\s+/g, ' ').trim();
    const truncated =
      cleaned.length > this.maxSqlLength
        ? `${cleaned.substring(0, this.maxSqlLength)}...`
        : cleaned;

    const keywords = [
      'SELECT',
      'FROM',
      'WHERE',
      'INSERT INTO',
      'INSERT',
      'VALUES',
      'UPDATE',
      'SET',
      'DELETE',
      'INNER JOIN',
      'LEFT JOIN',
      'RIGHT JOIN',
      'JOIN',
      'ON',
      'GROUP BY',
      'ORDER BY',
      'ASC',
      'DESC',
      'LIMIT',
      'OFFSET',
      'HAVING',
      'UNION',
      'BEGIN',
      'COMMIT',
      'ROLLBACK'
    ];

    const regex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
    return truncated.replace(regex, (match) => pc.cyan(pc.bold(match.toUpperCase())));
  }

  /**
   * Mask sensitive keys in parameter arrays/objects to prevent credentials leakage.
   */
  private sanitizeParams(params: unknown[]): unknown[] {
    if (!this.maskSensitive) return params;

    return params.map((item) => {
      if (item === null || item === undefined) return item;

      if (typeof item === 'object') {
        const copy: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(item as Record<string, unknown>)) {
          if (this.sensitiveKeys.has(key.toLowerCase())) {
            copy[key] = '********';
          } else {
            copy[key] = val;
          }
        }
        return copy;
      }

      return item;
    });
  }
}
