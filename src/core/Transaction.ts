import type { PoolConnection } from 'mysql2/promise';
import { BaseClient } from './BaseClient';
import type { Instrumentation } from './Instrumentation';

/**
 * Encapsulates an active MySQL transaction on a dedicated connection.
 * Inherits all standard query, CRUD, and pagination methods from BaseClient.
 */
export class Transaction extends BaseClient {
  constructor(
    public readonly connection: PoolConnection,
    instrumentation: Instrumentation
  ) {
    super(instrumentation);
  }

  /**
   * Returns the scoped transaction connection.
   */
  protected getExecutor(): PoolConnection {
    return this.connection;
  }
}
