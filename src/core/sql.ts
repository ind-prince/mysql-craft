import { DatabaseError, ValidationError } from '../errors';

export interface WhereCondition {
  column: string;
  operator?: '=' | '!=' | '<>' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  value?: any;
}

export interface OrderByCondition {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface SelectQueryOptions {
  table: string;
  fields?: string[];
  where?: Record<string, any> | WhereCondition[];
  search?: {
    fields: string[];
    term: string;
  };
  orderBy?: OrderByCondition[];
  limit?: number;
  offset?: number;
}

export interface CountQueryOptions {
  table: string;
  where?: Record<string, any> | WhereCondition[];
  search?: {
    fields: string[];
    term: string;
  };
}

export interface ParsedQueryParams {
  page: number;
  limit: number;
  offset: number;
  fields?: string[];
  orderBy?: OrderByCondition[];
  search?: {
    fields: string[];
    term: string;
  };
  filters: Record<string, any>;
}

export interface QueryParseOptions {
  allowedFields?: string[];
  searchableFields?: string[];
  defaultLimit?: number;
  maxLimit?: number;
  defaultSort?: string;
}

/**
 * Validates and safely escapes an SQL identifier (column name or table name) with backticks.
 * Prevents identifier-based SQL injection attacks.
 */
export function escapeIdentifier(identifier: string): string {
  if (!identifier || typeof identifier !== 'string') {
    throw new ValidationError('Database identifier must be a non-empty string.');
  }

  const clean = identifier.trim();
  // Allow simple identifiers or table.column format
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return `${escapeIdentifier(parts[0])}.${escapeIdentifier(parts[1])}`;
    }
  }

  if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
    throw new ValidationError(
      `Invalid database identifier: "${clean}". Identifiers must only contain alphanumeric characters and underscores.`
    );
  }

  return `\`${clean}\``;
}

/**
 * Builds where clause string and associated parameter list from object or condition array.
 */
function buildWhereClauses(
  where?: Record<string, any> | WhereCondition[],
  search?: { fields: string[]; term: string }
): { clause: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  // 1. Exact or structured conditions
  if (where) {
    if (Array.isArray(where)) {
      for (const cond of where) {
        const escapedCol = escapeIdentifier(cond.column);
        const op = (cond.operator || '=').toUpperCase();

        if (op === 'IS NULL' || op === 'IS NOT NULL') {
          clauses.push(`${escapedCol} ${op}`);
        } else if (op === 'IN') {
          const list = Array.isArray(cond.value) ? cond.value : [cond.value];
          if (list.length === 0) {
            clauses.push('1 = 0'); // Empty IN condition is always false
          } else {
            const placeholders = list.map(() => '?').join(', ');
            clauses.push(`${escapedCol} IN (${placeholders})`);
            params.push(...list);
          }
        } else {
          clauses.push(`${escapedCol} ${op} ?`);
          params.push(cond.value);
        }
      }
    } else {
      for (const [col, val] of Object.entries(where)) {
        if (val === undefined) continue;
        const escapedCol = escapeIdentifier(col);
        if (val === null) {
          clauses.push(`${escapedCol} IS NULL`);
        } else {
          clauses.push(`${escapedCol} = ?`);
          params.push(val);
        }
      }
    }
  }

  // 2. Search term applied with LIKE across searchable fields
  if (search && search.term && search.fields.length > 0) {
    const searchClauses: string[] = [];
    const searchPattern = `%${search.term}%`;

    for (const field of search.fields) {
      searchClauses.push(`${escapeIdentifier(field)} LIKE ?`);
      params.push(searchPattern);
    }

    if (searchClauses.length > 0) {
      clauses.push(`(${searchClauses.join(' OR ')})`);
    }
  }

  const clause = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  return { clause, params };
}

/**
 * Builds a pure, parameterized SELECT query.
 */
export function buildSelectQuery(options: SelectQueryOptions): { sql: string; params: any[] } {
  const escapedTable = escapeIdentifier(options.table);

  // Projection / Field Selection
  let fieldsClause = '*';
  if (options.fields && options.fields.length > 0) {
    fieldsClause = options.fields.map(escapeIdentifier).join(', ');
  }

  const { clause: whereClause, params } = buildWhereClauses(options.where, options.search);

  // Sorting / ORDER BY
  let orderClause = '';
  if (options.orderBy && options.orderBy.length > 0) {
    const orderItems = options.orderBy.map(
      (o) => `${escapeIdentifier(o.column)} ${o.direction === 'DESC' ? 'DESC' : 'ASC'}`
    );
    orderClause = ` ORDER BY ${orderItems.join(', ')}`;
  }

  // Pagination / LIMIT & OFFSET
  let paginationClause = '';
  if (options.limit !== undefined) {
    paginationClause += ` LIMIT ?`;
    params.push(Number(options.limit));

    if (options.offset !== undefined) {
      paginationClause += ` OFFSET ?`;
      params.push(Number(options.offset));
    }
  }

  const sql = `SELECT ${fieldsClause} FROM ${escapedTable}${whereClause}${orderClause}${paginationClause}`;
  return { sql, params };
}

/**
 * Builds a pure, parameterized COUNT(*) query matching the WHERE and SEARCH filters.
 */
export function buildCountQuery(options: CountQueryOptions): { sql: string; params: any[] } {
  const escapedTable = escapeIdentifier(options.table);
  const { clause: whereClause, params } = buildWhereClauses(options.where, options.search);
  const sql = `SELECT COUNT(*) AS total FROM ${escapedTable}${whereClause}`;
  return { sql, params };
}

/**
 * Builds a pure, parameterized INSERT query for single or batch records.
 */
export function buildInsertQuery(
  table: string,
  records: Record<string, any>[]
): { sql: string; params: any[] } {
  if (records.length === 0) {
    throw new DatabaseError(`Cannot build insert query with empty record set for table "${table}".`);
  }

  const firstRecord = records[0];
  if (!firstRecord) {
    throw new DatabaseError(`Cannot build insert query with empty record set for table "${table}".`);
  }

  const columns = Object.keys(firstRecord);
  if (columns.length === 0) {
    throw new DatabaseError(`Cannot insert record with no keys into table "${table}".`);
  }

  const escapedTable = escapeIdentifier(table);
  const escapedColumns = columns.map(escapeIdentifier).join(', ');

  const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
  const allPlaceholders = records.map(() => rowPlaceholder).join(', ');

  const sql = `INSERT INTO ${escapedTable} (${escapedColumns}) VALUES ${allPlaceholders}`;
  const params: any[] = [];

  for (const item of records) {
    for (const col of columns) {
      params.push(item[col] !== undefined ? item[col] : null);
    }
  }

  return { sql, params };
}

/**
 * Builds a pure, parameterized UPDATE query.
 */
export function buildUpdateQuery(
  table: string,
  data: Record<string, any>,
  whereClause: string,
  whereParams: any[] = []
): { sql: string; params: any[] } {
  const keys = Object.keys(data);
  if (keys.length === 0) {
    throw new DatabaseError(`Cannot build update query with empty data for table "${table}".`);
  }

  const escapedTable = escapeIdentifier(table);
  const setStatements = keys.map((key) => `${escapeIdentifier(key)} = ?`).join(', ');
  const sql = `UPDATE ${escapedTable} SET ${setStatements} WHERE ${whereClause}`;

  const values = keys.map((key) => (data[key] !== undefined ? data[key] : null));
  return {
    sql,
    params: [...values, ...whereParams]
  };
}

/**
 * Builds a pure, parameterized DELETE query.
 */
export function buildDeleteQuery(
  table: string,
  whereClause: string,
  whereParams: any[] = []
): { sql: string; params: any[] } {
  const escapedTable = escapeIdentifier(table);
  const sql = `DELETE FROM ${escapedTable} WHERE ${whereClause}`;
  return { sql, params: [...whereParams] };
}

/**
 * Parses URL query parameters into strongly typed and whitelisted query components.
 * Supports:
 * - sort: `?sort=created_at:desc,first_name:asc` or `-created_at,first_name`
 * - pagination: `?page=2&limit=25`
 * - projection: `?fields=id,email,status`
 * - search: `?search=keyword`
 * - column filters: `?role=admin&status=active`
 */
export function parseQueryParams(
  rawQuery: Record<string, any> = {},
  options: QueryParseOptions = {}
): ParsedQueryParams {
  const allowedSet = options.allowedFields ? new Set(options.allowedFields) : null;
  const searchableFields = options.searchableFields ?? [];
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;

  // 1. Pagination
  const rawPage = Number(rawQuery.page);
  const page = !isNaN(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const rawLimit = Number(rawQuery.limit);
  let limit = !isNaN(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  if (limit < 1) limit = 1;

  const offset = (page - 1) * limit;

  // 2. Field Selection / Projection
  let fields: string[] | undefined = undefined;
  if (rawQuery.fields && typeof rawQuery.fields === 'string') {
    const requested = rawQuery.fields.split(',').map((f) => f.trim()).filter(Boolean);
    if (allowedSet) {
      fields = requested.filter((f) => allowedSet.has(f));
      if (fields.length === 0) {
        fields = undefined; // Fallback to all allowed if none matched
      }
    } else {
      fields = requested;
    }
  }

  // 3. Sorting (supports "created_at:desc" or "-created_at")
  const orderBy: OrderByCondition[] = [];
  const sortParam = rawQuery.sort || options.defaultSort;
  if (sortParam && typeof sortParam === 'string') {
    const parts = sortParam.split(',').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      let column = part;
      let direction: 'ASC' | 'DESC' = 'ASC';

      if (part.startsWith('-')) {
        column = part.slice(1);
        direction = 'DESC';
      } else if (part.includes(':')) {
        const [col, dir] = part.split(':');
        column = col?.trim() ?? '';
        direction = dir?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      }

      if (!allowedSet || allowedSet.has(column)) {
        orderBy.push({ column, direction });
      }
    }
  }

  // 4. Searching
  let search: { fields: string[]; term: string } | undefined = undefined;
  if (rawQuery.search && typeof rawQuery.search === 'string' && searchableFields.length > 0) {
    const term = rawQuery.search.trim();
    if (term.length > 0) {
      search = { fields: searchableFields, term };
    }
  }

  // 5. Exact Column Filters (excluding reserved keys)
  const reservedKeys = new Set(['page', 'limit', 'sort', 'fields', 'search']);
  const filters: Record<string, any> = {};

  for (const [key, value] of Object.entries(rawQuery)) {
    if (reservedKeys.has(key) || value === undefined || value === '') continue;
    if (allowedSet && !allowedSet.has(key)) continue;

    filters[key] = value;
  }

  return {
    page,
    limit,
    offset,
    fields,
    orderBy: orderBy.length > 0 ? orderBy : undefined,
    search,
    filters
  };
}
