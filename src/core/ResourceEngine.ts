import type { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import type { BaseClient } from './BaseClient';
import { parseQueryParams, escapeIdentifier } from './sql';
import { authenticateJwt, requireRole, type ExpressAuthOptions } from '../middleware/expressAuth';
import { ValidationError } from '../errors';

/**
 * Safely instantiates an Express Router at runtime without bundling Express into
 * production dependencies. Throws a clear error if Express is not installed.
 */
function resolveExpressRouter(): Router {
  try {
    const express = require('express');
    const routerFactory = express.Router || express.default?.Router || express;
    return typeof routerFactory === 'function' ? routerFactory() : routerFactory.call(express);
  } catch (_err) {
    throw new Error(
      'The "express" package is required to use createResourceRouter. ' +
      'Please install it in your project: npm install express'
    );
  }
}

export interface ResourceHooks {
  beforeCreate?: (data: any, req: Request) => Promise<any> | any;
  afterCreate?: (created: any, req: Request) => Promise<any> | any;
  beforeUpdate?: (id: any, data: any, req: Request) => Promise<any> | any;
  afterUpdate?: (updated: any, req: Request) => Promise<any> | any;
  beforeDelete?: (id: any, req: Request) => Promise<void> | void;
  afterDelete?: (id: any, req: Request) => Promise<void> | void;
}

export interface ResourceEngineOptions {
  /**
   * Primary key column name for this table.
   * Default: 'id'
   */
  primaryKey?: string;

  /**
   * Whitelist of permitted column names for selection, filtering, and sorting.
   */
  allowedFields?: string[];

  /**
   * Fields that cannot be mutated on create or update (e.g. 'id', 'created_at').
   * Automatically removed from incoming request payloads.
   */
  readOnlyFields?: string[];

  /**
   * Sensitive fields that are never returned in HTTP responses (e.g. 'password_hash', 'secret').
   */
  hiddenFields?: string[];

  /**
   * Columns to search with LIKE %term% when ?search= query param is provided.
   */
  searchableFields?: string[];

  /**
   * Default page size if limit is omitted. Default: 20.
   */
  defaultLimit?: number;

  /**
   * Maximum page size allowed. Default: 100.
   */
  maxLimit?: number;

  /**
   * Default sort clause, e.g. 'created_at:desc' or 'id:asc'.
   */
  defaultSort?: string;

  /**
   * Authentication options for this router:
   * - ExpressAuthOptions or custom secret
   * - RequestHandler custom middleware
   * - boolean: if true, requires valid JWT (expects JWT_SECRET in env)
   */
  auth?: boolean | ExpressAuthOptions | RequestHandler;

  /**
   * Optional RBAC role requirement to access this resource.
   */
  requireRoles?: string[];

  /**
   * Custom lifecycle hooks for data validation or audit trailing.
   */
  hooks?: ResourceHooks;
}

/**
 * Strips hidden fields from a record or array of records.
 */
function stripHiddenFields<T extends Record<string, any>>(
  item: T | null | undefined,
  hiddenKeys: Set<string>
): T | null {
  if (!item) return null;
  if (hiddenKeys.size === 0) return item;

  const copy = { ...item };
  for (const key of hiddenKeys) {
    delete (copy as any)[key];
  }
  return copy;
}

/**
 * Generates a fully featured, safe Express router for instant CRUD operations on a database table.
 *
 * @example
 * app.use('/api/accounts', createResourceRouter(db, 'account', {
 *   primaryKey: 'iduser',
 *   allowedFields: ['iduser', 'email', 'first_name', 'last_name', 'created_at'],
 *   readOnlyFields: ['iduser', 'created_at'],
 *   hiddenFields: ['password_hash'],
 *   searchableFields: ['email', 'first_name', 'last_name'],
 *   auth: { secret: process.env.JWT_SECRET! }
 * }));
 */
export function createResourceRouter(
  client: BaseClient,
  table: string,
  options: ResourceEngineOptions = {}
): Router {
  const router = resolveExpressRouter();
  const primaryKey = options.primaryKey ?? 'id';
  const readOnlySet = new Set(options.readOnlyFields ?? [primaryKey, 'created_at']);
  const hiddenSet = new Set(options.hiddenFields ?? ['password', 'password_hash', 'hash', 'secret']);
  const allowedSet = options.allowedFields ? new Set(options.allowedFields) : null;
  const hooks = options.hooks ?? {};

  // 1. Configure Authentication & Authorization Middleware
  const middlewares: RequestHandler[] = [];
  if (options.auth) {
    if (typeof options.auth === 'function') {
      middlewares.push(options.auth);
    } else if (typeof options.auth === 'object') {
      middlewares.push(authenticateJwt(options.auth));
    } else if (options.auth === true) {
      const secret = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET or JWT_ACCESS_SECRET must be set when auth: true is enabled.');
      }
      middlewares.push(authenticateJwt({ secret }));
    }
  }

  if (options.requireRoles && options.requireRoles.length > 0) {
    middlewares.push(requireRole(...options.requireRoles));
  }

  if (middlewares.length > 0) {
    router.use(...middlewares);
  }

  // Helper to filter payload according to allowed and readOnly sets
  const sanitizePayload = (body: Record<string, any>): Record<string, any> => {
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(body)) {
      if (readOnlySet.has(key)) continue;
      if (allowedSet && !allowedSet.has(key)) continue;
      clean[key] = val;
    }
    return clean;
  };

  // --------------------------------------------------------------------------
  // LIST / SEARCH (GET /)
  // --------------------------------------------------------------------------
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const queryParams = parseQueryParams(req.query, {
        allowedFields: options.allowedFields,
        searchableFields: options.searchableFields,
        defaultLimit: options.defaultLimit,
        maxLimit: options.maxLimit,
        defaultSort: options.defaultSort ?? `${primaryKey}:asc`
      });

      const result = await client.paginate(table, queryParams);
      const sanitizedData = result.data.map((item) => stripHiddenFields(item, hiddenSet));

      res.status(200).json({
        success: true,
        data: sanitizedData,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // GET ONE BY ID (GET /:id)
  // --------------------------------------------------------------------------
  router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id;
      if (!id) {
        throw new ValidationError('Resource ID must be specified.');
      }

      const escapedTable = escapeIdentifier(table);
      const escapedPk = escapeIdentifier(primaryKey);
      const sql = `SELECT * FROM ${escapedTable} WHERE ${escapedPk} = ? LIMIT 1`;

      const record = await client.queryOne(sql, [id]);
      if (!record) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Resource with ${primaryKey} "${id}" not found in "${table}".`
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: stripHiddenFields(record, hiddenSet)
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // CREATE (POST /)
  // --------------------------------------------------------------------------
  router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let data = sanitizePayload(req.body);
      if (Object.keys(data).length === 0) {
        throw new ValidationError('Payload contains no valid or writable fields.');
      }

      if (hooks.beforeCreate) {
        data = (await hooks.beforeCreate(data, req)) || data;
      }

      const insertResult = await client.insert(table, data);
      const recordId = insertResult.insertId || data[primaryKey];

      let createdRecord: any = null;
      if (recordId) {
        const escapedTable = escapeIdentifier(table);
        const escapedPk = escapeIdentifier(primaryKey);
        createdRecord = await client.queryOne(
          `SELECT * FROM ${escapedTable} WHERE ${escapedPk} = ? LIMIT 1`,
          [recordId]
        );
      }

      const finalRecord = createdRecord || { ...data, [primaryKey]: recordId };

      if (hooks.afterCreate) {
        await hooks.afterCreate(finalRecord, req);
      }

      res.status(201).json({
        success: true,
        data: stripHiddenFields(finalRecord, hiddenSet)
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // UPDATE (PUT /:id or PATCH /:id)
  // --------------------------------------------------------------------------
  const updateHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id;
      if (!id) {
        throw new ValidationError('Resource ID must be specified.');
      }

      let data = sanitizePayload(req.body);
      if (Object.keys(data).length === 0) {
        throw new ValidationError('Payload contains no writable fields for update.');
      }

      const escapedTable = escapeIdentifier(table);
      const escapedPk = escapeIdentifier(primaryKey);

      // Verify existence
      const existing = await client.queryOne(
        `SELECT ${escapedPk} FROM ${escapedTable} WHERE ${escapedPk} = ? LIMIT 1`,
        [id]
      );
      if (!existing) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Resource with ${primaryKey} "${id}" not found.`
          }
        });
        return;
      }

      if (hooks.beforeUpdate) {
        data = (await hooks.beforeUpdate(id, data, req)) || data;
      }

      await client.update(table, data, `${escapedPk} = ?`, [id]);

      const updatedRecord = await client.queryOne(
        `SELECT * FROM ${escapedTable} WHERE ${escapedPk} = ? LIMIT 1`,
        [id]
      );

      if (hooks.afterUpdate) {
        await hooks.afterUpdate(updatedRecord, req);
      }

      res.status(200).json({
        success: true,
        data: stripHiddenFields(updatedRecord, hiddenSet)
      });
    } catch (err) {
      next(err);
    }
  };

  router.put('/:id', updateHandler);
  router.patch('/:id', updateHandler);

  // --------------------------------------------------------------------------
  // DELETE (DELETE /:id)
  // --------------------------------------------------------------------------
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id;
      if (!id) {
        throw new ValidationError('Resource ID must be specified.');
      }

      const escapedTable = escapeIdentifier(table);
      const escapedPk = escapeIdentifier(primaryKey);

      // Verify existence
      const existing = await client.queryOne(
        `SELECT ${escapedPk} FROM ${escapedTable} WHERE ${escapedPk} = ? LIMIT 1`,
        [id]
      );
      if (!existing) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Resource with ${primaryKey} "${id}" not found.`
          }
        });
        return;
      }

      if (hooks.beforeDelete) {
        await hooks.beforeDelete(id, req);
      }

      await client.delete(table, `${escapedPk} = ?`, [id]);

      if (hooks.afterDelete) {
        await hooks.afterDelete(id, req);
      }

      res.status(200).json({
        success: true,
        message: `Resource with ${primaryKey} "${id}" deleted successfully.`
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
