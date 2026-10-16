import pc from 'picocolors';

export interface QueryEvent {
  sql: string;
  params: any[];
  durationMs: number;
  rowCount?: number;
  connectionId?: number | string;
  isSlow?: boolean;
}

export interface ErrorEvent {
  error: Error | any;
  sql?: string;
  params?: any[];
  durationMs?: number;
}

export interface RetryEvent {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: Error | any;
  isDeadlock: boolean;
  operationType: 'read' | 'write' | 'transaction';
}

export interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  queuedRequests: number;
}

export interface Instrumentation {
  onQuery?(event: QueryEvent): void;
  onError?(event: ErrorEvent): void;
  onRetry?(event: RetryEvent): void;
  onTransaction?(action: 'START' | 'COMMIT' | 'ROLLBACK', connectionId?: number | string): void;
  onPoolMetrics?(metrics: PoolMetrics): void;
}

export interface LoggerConfig {
  enabled?: boolean;
  slowThresholdMs?: number;
  maxSqlLength?: number;
  maskSensitive?: boolean;
  maskSensitiveParams?: boolean;
  sensitiveKeys?: string[];
}

export interface MaskingOptions {
  maskSensitive?: boolean;
  sensitiveKeys?: string[];
  maxStringLength?: number;
}

const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'passwd',
  'password_hash',
  'secret',
  'token',
  'refreshtoken',
  'accesstoken',
  'jwt',
  'credit_card',
  'card_number',
  'cvv',
  'hash',
  'salt',
  'authorization'
];

/**
 * Parameter sanitizer that masks credentials and truncates huge strings to prevent terminal leaks.
 */
export class ParameterSanitizer {
  private sensitiveKeys: Set<string>;
  private maxStringLength: number;
  private enabled: boolean;

  constructor(options?: MaskingOptions) {
    this.enabled = options?.maskSensitive ?? true;
    this.maxStringLength = options?.maxStringLength ?? 250;
    this.sensitiveKeys = new Set([
      ...DEFAULT_SENSITIVE_KEYS,
      ...(options?.sensitiveKeys ?? []).map((k) => k.toLowerCase())
    ]);
  }

  public sanitize(params: unknown[]): unknown[] {
    if (!this.enabled || !params) return params;

    return params.map((item) => this.sanitizeValue(item));
  }

  private sanitizeValue(val: unknown): unknown {
    if (val === null || val === undefined) return val;

    if (typeof val === 'string') {
      if (val.length > this.maxStringLength) {
        return `${val.substring(0, this.maxStringLength)}... [truncated, length: ${val.length}]`;
      }
      return val;
    }

    if (Buffer.isBuffer(val)) {
      return `<Buffer len=${val.length}>`;
    }

    if (Array.isArray(val)) {
      return val.map((v) => this.sanitizeValue(v));
    }

    if (typeof val === 'object') {
      const copy: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(val as Record<string, unknown>)) {
        if (this.sensitiveKeys.has(key.toLowerCase())) {
          copy[key] = '********';
        } else {
          copy[key] = this.sanitizeValue(prop);
        }
      }
      return copy;
    }

    return val;
  }
}

/**
 * Formatted, human-readable terminal logger implementing the Instrumentation interface.
 */
export class TerminalLoggerInstrumentation implements Instrumentation {
  private sanitizer: ParameterSanitizer;
  private slowThresholdMs: number;
  private maxSqlLength: number;

  constructor(options?: {
    slowThresholdMs?: number;
    maxSqlLength?: number;
    maskSensitive?: boolean;
    sensitiveKeys?: string[];
  }) {
    this.slowThresholdMs = options?.slowThresholdMs ?? 500;
    this.maxSqlLength = options?.maxSqlLength ?? 1000;
    this.sanitizer = new ParameterSanitizer({
      maskSensitive: options?.maskSensitive ?? true,
      sensitiveKeys: options?.sensitiveKeys
    });
  }

  public onQuery(event: QueryEvent): void {
    const isSlow = event.isSlow || event.durationMs >= this.slowThresholdMs;
    const timestamp = pc.dim(new Date().toLocaleTimeString());
    const badge = isSlow
      ? pc.bgYellow(pc.black(' SLOW QUERY '))
      : pc.bgCyan(pc.black(' MYSQL '));

    const durationText = this.formatDuration(event.durationMs);
    const highlightedSql = this.highlightSql(event.sql);

    console.log(`\n${badge} ${timestamp}  ${durationText}`);
    console.log(`  ${pc.bold('SQL:')}    ${highlightedSql}`);

    if (event.params && event.params.length > 0) {
      const sanitized = this.sanitizer.sanitize(event.params);
      console.log(`  ${pc.bold('Params:')} ${pc.dim(JSON.stringify(sanitized))}`);
    }

    if (event.rowCount !== undefined) {
      console.log(`  ${pc.bold('Result:')} ${pc.magenta(`${event.rowCount} row(s)`)}`);
    }
  }

  public onError(event: ErrorEvent): void {
    const timestamp = pc.dim(new Date().toLocaleTimeString());
    const badge = pc.bgRed(pc.white(' DB ERROR '));

    console.error(`\n${badge} ${timestamp} ${pc.red(pc.bold(event.error?.message ?? 'Unknown error'))}`);

    if (event.sql) {
      console.error(`  ${pc.bold('Failed SQL:')} ${pc.yellow(event.sql)}`);
    }

    if (event.params && event.params.length > 0) {
      const sanitized = this.sanitizer.sanitize(event.params);
      console.error(`  ${pc.bold('Params:')}     ${pc.dim(JSON.stringify(sanitized))}`);
    }

    if (event.error?.code) {
      console.error(`  ${pc.bold('Code:')}       ${pc.red(event.error.code)}`);
    }
  }

  public onRetry(event: RetryEvent): void {
    const timestamp = pc.dim(new Date().toLocaleTimeString());
    const badge = pc.bgYellow(pc.black(' RETRY '));
    const reason = event.isDeadlock ? 'Deadlock (1213)' : event.error?.code || 'Transient Error';

    console.warn(
      `${badge} ${timestamp} [${reason}] Retrying ${event.operationType} attempt ${event.attempt}/${event.maxAttempts} in ${event.delayMs}ms...`
    );
  }

  public onTransaction(action: 'START' | 'COMMIT' | 'ROLLBACK', connectionId?: number | string): void {
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

  private highlightSql(sql: string): string {
    const cleaned = sql.replace(/\s+/g, ' ').trim();
    const truncated =
      cleaned.length > this.maxSqlLength ? `${cleaned.substring(0, this.maxSqlLength)}...` : cleaned;

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
      'LIKE',
      'IN',
      'IS NULL',
      'IS NOT NULL',
      'BEGIN',
      'COMMIT',
      'ROLLBACK'
    ];

    const regex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
    return truncated.replace(regex, (match) => pc.cyan(pc.bold(match.toUpperCase())));
  }
}

/**
 * Dispatcher that broadcasts events to multiple registered instrumentation hooks.
 */
export class InstrumentationManager implements Instrumentation {
  private listeners: Instrumentation[] = [];

  constructor(initialListeners: Instrumentation[] = []) {
    this.listeners = [...initialListeners];
  }

  public addListener(listener: Instrumentation): void {
    this.listeners.push(listener);
  }

  public onQuery(event: QueryEvent): void {
    for (const l of this.listeners) {
      try {
        l.onQuery?.(event);
      } catch (e) {
        console.error('[InstrumentationManager] Listener failed on onQuery:', e);
      }
    }
  }

  public onError(event: ErrorEvent): void {
    for (const l of this.listeners) {
      try {
        l.onError?.(event);
      } catch (e) {
        console.error('[InstrumentationManager] Listener failed on onError:', e);
      }
    }
  }

  public onRetry(event: RetryEvent): void {
    for (const l of this.listeners) {
      try {
        l.onRetry?.(event);
      } catch (e) {
        console.error('[InstrumentationManager] Listener failed on onRetry:', e);
      }
    }
  }

  public onTransaction(action: 'START' | 'COMMIT' | 'ROLLBACK', connectionId?: number | string): void {
    for (const l of this.listeners) {
      try {
        l.onTransaction?.(action, connectionId);
      } catch (e) {
        console.error('[InstrumentationManager] Listener failed on onTransaction:', e);
      }
    }
  }

  public onPoolMetrics(metrics: PoolMetrics): void {
    for (const l of this.listeners) {
      try {
        l.onPoolMetrics?.(metrics);
      } catch (e) {
        console.error('[InstrumentationManager] Listener failed on onPoolMetrics:', e);
      }
    }
  }
}
