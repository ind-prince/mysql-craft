# @mysql-craft ⚡

[![npm version](https://img.shields.io/npm/v/@mysql-craft.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@mysql-craft)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178c6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-37%20Passed-6e9f18.svg?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Downloads](https://img.shields.io/npm/dm/@mysql-craft.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/@mysql-craft)

> **The modern, high-velocity MySQL engine for Node.js & TypeScript.**  
> Eliminates SQL injection by default, eradicates boilerplate with **Instant 1-Line CRUD Routers**, automatically recovers from deadlocks with full-jitter retries, enforces bounded connection pool safety (fail-fast HTTP 503), and provides industrial-strength auth & visual diagnostics.

---

## 📑 Table of Contents

- [Why @mysql-craft?](#-why-archmysql-craft)
- [Architectural Comparison](#-architectural-comparison)
- [Installation](#-installation)
- [Quick Start Guide](#-quick-start-guide)
- [Instant CRUD Resource Engine (1-Line REST API)](#-instant-crud-resource-engine-1-line-rest-api)
  - [Basic Setup](#basic-resource-router-setup)
  - [Query Parameter Capabilities](#query-parameter-capabilities)
  - [Lifecycle Hooks](#lifecycle-hooks)
  - [Resource Configuration Options](#resource-configuration-options)
- [Core Database & Query API](#-core-database--query-api)
  - [Parameterized Queries (`query`, `queryOne`)](#1-parameterized-queries-query-queryone)
  - [Mutations (`execute`, `insert`, `update`, `delete`)](#2-high-level-mutations-insert-update-delete)
  - [Structured Select & Count (`select`, `count`)](#3-structured-query-builders-select-count)
  - [Database Methods Reference Table](#database-methods-reference-table)
- [Atomic Transactions with Deadlock Retries](#-atomic-transactions-with-deadlock-retries)
- [Security & Authentication Module](#-security--authentication-module)
  - [Bcrypt Password Hashing](#1-password-hashing-bcrypt)
  - [JWT Token Management & Rotation](#2-jwt-token-management--rotation)
  - [User Record Sanitization](#3-user-record-sanitization)
  - [Cryptographic Token Generator](#4-cryptographic-token-generation)
- [Express Middleware Suite](#-express-middleware-suite)
  - [JWT Authentication Middleware](#1-jwt-authentication-middleware)
  - [Role-Based Access Control (RBAC)](#2-role-based-access-control-rbac)
  - [Lightweight Body Validator](#3-request-body-validation)
  - [Centralized Error Middleware](#4-centralized-error-middleware)
- [Resilience, Pool Management & Health Checks](#-resilience-pool-management--health-checks)
  - [Bounded Pool Queue & Fail-Fast HTTP 503](#bounded-connection-pooling--fail-fast-503)
  - [Exponential Backoff with Full Jitter](#exponential-backoff-with-full-jitter)
  - [Kubernetes Liveness, Readiness & Health Checks](#kubernetes-liveness-readiness--health-checks)
  - [Graceful Shutdown (Drain)](#graceful-shutdown-drain)
- [Visual Diagnostics, Masking & Instrumentation](#-visual-diagnostics-masking--instrumentation)
  - [Colorized SQL Terminal Logger](#colorized-sql-terminal-logger)
  - [Automatic Credential Masking](#automatic-credential-masking)
  - [APM & Telemetry Hooks (Prometheus, Datadog, OpenTelemetry)](#custom-telemetry--apm-integration)
- [Pure SQL Builders & Sanitizers](#-pure-sql-builders--sanitizers)
- [Error Hierarchy & HTTP Status Mapping](#-error-hierarchy--http-status-mapping)
- [TypeScript Integration & Type Safety](#-typescript-integration--type-safety)
- [Package Subpath Exports](#-package-subpath-exports)
- [Configuration Reference](#-configuration-reference)
- [Contributing & Development](#-contributing--development)
- [License](#-license)

---

## 💡 Why @mysql-craft?

Writing direct MySQL code in Node.js applications frequently leads to four recurring architectural liabilities:

1. **SQL Injection Vulnerabilities:** Developers inadvertently concatenate strings or mismanage identifiers in dynamic `WHERE`, `ORDER BY`, or `LIMIT` clauses.
2. **Repetitive CRUD Boilerplate:** Teams spend dozens of hours writing identical controllers, services, and queries for simple database tables.
3. **Connection Starvation & Memory Leaks:** Unbounded connection pools queue incoming requests indefinitely under traffic spikes, causing Node.js processes to run out of memory (OOM) instead of failing fast.
4. **Unhandled Deadlocks & Transient Drops:** MySQL deadlocks (`ER_LOCK_DEADLOCK` / code `1213`) crash concurrent transactions if not wrapped in retry logic.
5. **Credential Leaks in Developer Logs:** Debug statements dump raw SQL queries containing plaintext passwords, hashes, and credit cards directly to stdout.

`@mysql-craft` was engineered from the ground up to eliminate these risks with zero runtime overhead and an exceptional developer experience.

---

## ⚖️ Architectural Comparison

| Feature | Raw `mysql2` | Prisma / TypeORM | Knex.js | `@mysql-craft` |
| :--- | :---: | :---: | :---: | :---: |
| **Instant 1-Line REST Routers** | ❌ No | ❌ No | ❌ No | ✅ **Yes (`createResourceRouter`)** |
| **SQL Injection Proof By Default** | ⚠️ Developer-dependent | ✅ Yes | ✅ Yes | ✅ **Yes (Guaranteed Parameterization)** |
| **Deadlock Retries with Full Jitter** | ❌ No | ❌ Manual | ❌ Manual | ✅ **Built-in (`retries: 3`)** |
| **Bounded Queue (Fail-Fast 503)** | ❌ Infinite queue | ⚠️ Configurable | ⚠️ Configurable | ✅ **Yes (`connectionLimit * 10`)** |
| **Visual Colorized Query Logger** | ❌ None | ⚠️ Third-party | ⚠️ Third-party | ✅ **Built-in Syntax & Timing Badges** |
| **Automated Credential Masking** | ❌ No | ❌ No | ❌ No | ✅ **Built-in (`password`, `token`, etc.)** |
| **Integrated Bcrypt & JWT Auth** | ❌ None | ❌ None | ❌ None | ✅ **Built-in Security Module** |
| **K8s Health & Liveness Checks** | ❌ Manual | ❌ Manual | ❌ Manual | ✅ **Built-in (`healthCheck`, `drain`)** |
| **Engine Footprint** | Lightweight | Heavy (Binary engines) | Medium | ⚡ **Ultra-lightweight (<25KB)** |

---

## 📦 Installation

Install the package alongside the required `mysql2` driver:

```bash
# Using npm
npm install @mysql-craft mysql2

# Using pnpm
pnpm add @mysql-craft mysql2

# Using yarn
yarn add @mysql-craft mysql2

# Using bun
bun add @mysql-craft mysql2
```

### Peer Dependencies

If you utilize the **Instant CRUD Resource Engine** or the **Express Middleware Suite**, ensure `express` is installed:

```bash
npm install express
npm install -D @types/express
```

> **Note on Compatibility:** Fully compatible with Express `v4.18+` and Express `v5.0+`, Node.js `>= 18.0.0`, and TypeScript `>= 5.0`.

---

## 🚀 Quick Start Guide

### 1. Initialize the Database Client

Create a centralized database instance using `createDbClient`:

```typescript
// src/config/database.ts
import { createDbClient } from '@mysql-craft';

export const db = createDbClient({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'ecommerce_db',
  connectionLimit: 15, // Max 15 active pool connections
  debug: process.env.NODE_ENV !== 'production' // Colorized terminal logs in development
});
```

### 2. Execute Type-Safe Queries

```typescript
// src/services/userService.ts
import { db } from '../config/database';

interface User {
  iduser: number;
  email: string;
  first_name: string;
  role: 'user' | 'admin';
  created_at: Date;
}

// Fetch a single record (returns User or null)
const user = await db.queryOne<User>(
  'SELECT iduser, email, first_name, role, created_at FROM account WHERE email = ? LIMIT 1',
  ['alex@company.com']
);

// Fetch a typed array of records
const admins = await db.query<User>(
  'SELECT * FROM account WHERE role = ? ORDER BY created_at DESC',
  ['admin']
);
```

### 3. Build a Production Express Controller

```typescript
// src/controllers/AccountController.ts
import type { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { Security, ValidationError, AuthError } from '@mysql-craft';

export class AccountController {
  // Safe, transactional registration
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password || !firstName || !lastName) {
        throw new ValidationError('All fields are required.');
      }

      // Check for duplicate account
      const existing = await db.queryOne(
        'SELECT iduser FROM account WHERE email = ? LIMIT 1',
        [email]
      );
      if (existing) {
        throw new ValidationError('An account with this email address already exists.');
      }

      // Hash password using cost factor 12
      const passwordHash = await Security.hashPassword(password);

      // Execute transaction with automatic rollback and deadlock recovery
      const createdUser = await db.transaction(async (trx) => {
        const result = await trx.insert('account', {
          email,
          first_name: firstName,
          last_name: lastName,
          password_hash: passwordHash,
          role: 'user'
        });

        // Initialize user profile record in the same atomic transaction
        await trx.insert('account_profile', {
          iduser: result.insertId,
          bio: 'Welcome to my profile!'
        });

        return trx.queryOne('SELECT * FROM account WHERE iduser = ?', [result.insertId]);
      });

      // Generate Access & Refresh tokens
      const tokens = Security.generateTokenPair(
        { sub: createdUser.iduser, email: createdUser.email, role: createdUser.role },
        { sub: createdUser.iduser },
        {
          accessSecret: process.env.JWT_ACCESS_SECRET!,
          refreshSecret: process.env.JWT_REFRESH_SECRET!
        }
      );

      res.status(201).json({
        success: true,
        data: {
          user: Security.sanitizeUser(createdUser),
          tokens
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
```

---

## ⚡ Instant CRUD Resource Engine (1-Line REST API)

Stop writing repetitive controllers, services, and queries for every relational table. With **`db.createResourceRouter()`**, you generate an enterprise-grade, hardened Express router in **a single line of code**.

### Basic Resource Router Setup

```typescript
import express from 'express';
import { createDbClient, Security } from '@mysql-craft';

const app = express();
app.use(express.json());

const db = createDbClient({ /* db config */ });

// Mount a full CRUD REST API for table "account" under /api/accounts
app.use('/api/accounts', db.createResourceRouter('account', {
  primaryKey: 'iduser',
  allowedFields: ['iduser', 'email', 'first_name', 'last_name', 'role', 'created_at'],
  readOnlyFields: ['iduser', 'created_at'], // Clients cannot inject/override these on POST/PUT
  hiddenFields: ['password_hash'],           // Stripped from all HTTP responses
  searchableFields: ['email', 'first_name', 'last_name'], // Enabled for ?search=
  defaultLimit: 20,
  maxLimit: 100,
  auth: { secret: process.env.JWT_ACCESS_SECRET! }, // Enforces Bearer JWT
  hooks: {
    beforeCreate: async (data) => {
      if (data.password) {
        data.password_hash = await Security.hashPassword(data.password);
        delete data.password;
      }
      return data;
    }
  }
}));

app.listen(3000, () => console.log('API listening on http://localhost:3000'));
```

### Endpoints Generated Automatically

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Paginated listing with filtering, sorting, field selection, and search | `200 OK` |
| `GET` | `/:id` | Fetch single record by primary key | `200 OK`, `404 Not Found` |
| `POST` | `/` | Create new record (strips read-only fields & executes lifecycle hooks) | `201 Created`, `400 Bad Request` |
| `PUT` | `/:id` | Full update of existing record | `200 OK`, `404 Not Found`, `400 Bad Request` |
| `PATCH`| `/:id` | Partial update of existing record | `200 OK`, `404 Not Found`, `400 Bad Request` |
| `DELETE`| `/:id` | Remove record by primary key | `200 OK`, `404 Not Found` |

---

### Query Parameter Capabilities

The generated `GET /` endpoint inspects the URL query string and dynamically compiles safe, pure parameterized SQL queries:

#### 1. Pagination (`?page=` & `?limit=`)
```http
GET /api/accounts?page=2&limit=25
```
Automatically generates `LIMIT 25 OFFSET 25` and executes an associated `COUNT(*)` query, returning standardized pagination metadata:
```json
{
  "success": true,
  "data": [ /* 25 account items */ ],
  "meta": {
    "total": 100,
    "page": 2,
    "limit": 25,
    "totalPages": 4,
    "hasNext": true,
    "hasPrev": true
  }
}
```

#### 2. Safe Sorting (`?sort=`)
Supports comma-separated column definitions with explicit `:asc`/`:desc` directives or minus-prefix notation. All columns are strictly validated against `allowedFields`:
```http
GET /api/accounts?sort=created_at:desc,first_name:asc
GET /api/accounts?sort=-created_at,first_name
```

#### 3. Field Projection (`?fields=`)
Allows clients to request only a subset of columns, minimizing bandwidth:
```http
GET /api/accounts?fields=iduser,email,role
```
*Compiles to: `SELECT \`iduser\`, \`email\`, \`role\` FROM \`account\` ...`*

#### 4. Multi-Column Search (`?search=`)
Performs a parameterized `LIKE %term%` across all columns registered in `searchableFields`:
```http
GET /api/accounts?search=alex
```
*Compiles to: `WHERE (\`email\` LIKE ? OR \`first_name\` LIKE ? OR \`last_name\` LIKE ?)` with bound params `['%alex%', '%alex%', '%alex%']`.*

#### 5. Exact Column Filters
Any query parameter matching an allowed column acts as an exact equality filter (reserved parameters `page`, `limit`, `sort`, `fields`, and `search` are automatically segregated):
```http
GET /api/accounts?role=admin&status=active
```
*Compiles to: `WHERE \`role\` = ? AND \`status\` = ?`.*

---

### Lifecycle Hooks

Intercept and mutate payloads or trigger side-effects (auditing, email notifications, password hashing) during the CRUD lifecycle:

```typescript
const router = db.createResourceRouter('account', {
  hooks: {
    // Modify or validate payload before writing to the database
    beforeCreate: async (data, req) => {
      data.created_by_ip = req.ip;
      if (data.password) {
        data.password_hash = await Security.hashPassword(data.password);
        delete data.password;
      }
      return data;
    },

    // Trigger asynchronous side effects after database commit
    afterCreate: async (createdRecord, req) => {
      await emailService.sendWelcome(createdRecord.email);
    },

    // Intercept updates
    beforeUpdate: async (id, data, req) => {
      data.updated_at = new Date();
      return data;
    },

    // Audit logging after update
    afterUpdate: async (updatedRecord, req) => {
      auditLogger.info(`User ${updatedRecord.iduser} updated by ${req.user?.sub}`);
    },

    // Verify constraints before deletion
    beforeDelete: async (id, req) => {
      const orderCount = await db.count({ table: 'orders', where: { user_id: id } });
      if (orderCount > 0) {
        throw new ValidationError('Cannot delete user with active orders.');
      }
    },

    // Clean up associated resources after deletion
    afterDelete: async (id, req) => {
      await s3Client.deleteFolder(`avatars/${id}`);
    }
  }
});
```

---

### Resource Configuration Options

Pass a `ResourceEngineOptions` object to customize the router behavior:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `primaryKey` | `string` | `'id'` | Primary key column name of the underlying table. |
| `allowedFields` | `string[]` | `undefined` | Strict whitelist of column names permitted for selection, filtering, and sorting. |
| `readOnlyFields` | `string[]` | `['id', 'created_at']` | Fields stripped from incoming client payloads on `POST`, `PUT`, and `PATCH`. |
| `hiddenFields` | `string[]` | `['password', 'password_hash', 'hash', 'secret']` | Sensitive fields omitted from all JSON responses. |
| `searchableFields` | `string[]` | `[]` | Columns targeted when clients supply the `?search=term` query parameter. |
| `defaultLimit` | `number` | `20` | Default number of records returned per page when `limit` is omitted. |
| `maxLimit` | `number` | `100` | Hard upper ceiling for `limit` to prevent denial-of-service queries. |
| `defaultSort` | `string` | `${primaryKey}:asc` | Fallback sort clause if client omits `?sort=`. |
| `auth` | `boolean \| ExpressAuthOptions \| RequestHandler` | `undefined` | Enforces authentication. If `true`, requires valid JWT via `JWT_SECRET` / `JWT_ACCESS_SECRET`. |
| `requireRoles` | `string[]` | `undefined` | Enforces RBAC permissions (checks `req.user.role`). |
| `hooks` | `ResourceHooks` | `{}` | Lifecycle interceptors (`beforeCreate`, `afterCreate`, etc.). |

---

## 🛡️ Core Database & Query API

Both the primary `Database` client and scoped `Transaction` objects inherit from `BaseClient`, providing a unified, type-safe query interface.

### 1. Parameterized Queries (`query`, `queryOne`)

Pure parameterized execution prevents SQL injection by strictly segregating SQL statements from user inputs:

```typescript
// Fetch multiple typed rows
const users = await db.query<UserAccount>(
  'SELECT * FROM account WHERE role = ? AND active = ?',
  ['admin', 1]
);

// Fetch a single row or null
const user = await db.queryOne<UserAccount>(
  'SELECT * FROM account WHERE iduser = ? LIMIT 1',
  [42]
);

if (!user) {
  console.log('User not found');
}
```

### 2. High-Level Mutations (`insert`, `update`, `delete`)

Eliminate manual `INSERT INTO ...` string formatting with automated column escaping and value binding:

```typescript
// 1. Single Insert
const insertResult = await db.insert('account', {
  email: 'alex@company.com',
  first_name: 'Alex',
  last_name: 'Rivera',
  password_hash: await Security.hashPassword('Secret123!')
});
console.log(`Created account with ID: ${insertResult.insertId}`);

// 2. High-Performance Bulk Insert
await db.insert('account_profile', [
  { iduser: 1, phone: '555-0100', bio: 'Engineer' },
  { iduser: 2, phone: '555-0101', bio: 'Architect' },
  { iduser: 3, phone: '555-0102', bio: 'Product Lead' }
]);

// 3. Update
const updateResult = await db.update(
  'account',
  { first_name: 'Alexander', role: 'admin' },
  'iduser = ?',
  [1]
);
console.log(`Updated ${updateResult.affectedRows} row(s)`);

// 4. Delete
const deleteResult = await db.delete('account', 'iduser = ?', [10]);
console.log(`Deleted ${deleteResult.affectedRows} row(s)`);
```

### 3. Structured Query Builders (`select`, `count`)

For programmatic query construction with complex conditional logic:

```typescript
// Structured SELECT
const users = await db.select<UserAccount>({
  table: 'account',
  fields: ['iduser', 'email', 'role'],
  where: [
    { column: 'role', operator: 'IN', value: ['admin', 'moderator'] },
    { column: 'deleted_at', operator: 'IS NULL' }
  ],
  orderBy: [{ column: 'created_at', direction: 'DESC' }],
  limit: 10,
  offset: 0
});

// Structured COUNT
const totalAdmins = await db.count({
  table: 'account',
  where: { role: 'admin' }
});
```

---

### Database Methods Reference Table

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `query<T>(sql, params?, options?)` | `Promise<T[]>` | Executes parameterized SELECT with automatic transient retry policies. |
| `queryOne<T>(sql, params?, options?)` | `Promise<T \| null>` | Executes query and returns first element or `null`. |
| `execute(sql, params?, options?)` | `Promise<ResultSetHeader>` | Executes raw mutation query (INSERT, UPDATE, DELETE). |
| `insert(table, records, options?)` | `Promise<InsertResult>` | Inserts single record or batch records with identifier escaping. Returns `{ insertId, affectedRows }`. |
| `update(table, data, where, params?, options?)` | `Promise<UpdateResult>` | Executes parameterized UPDATE. Returns `{ affectedRows, changedRows }`. |
| `delete(table, where, params?, options?)` | `Promise<DeleteResult>` | Executes parameterized DELETE. Returns `{ affectedRows }`. |
| `select<T>(options, queryOpts?)` | `Promise<T[]>` | Programmatic structured SELECT query. |
| `count(options, queryOpts?)` | `Promise<number>` | Programmatic COUNT query matching filters. |
| `paginate<T>(table, queryParams, options?)` | `Promise<PaginatedResult<T>>` | Executes dual count + select queries with pagination metadata. |
| `transaction<T>(action, options?)` | `Promise<T>` | Executes callback inside atomic transaction with deadlock retries. |
| `createResourceRouter(table, options?)` | `Router` | Generates Express CRUD router. |
| `getPoolMetrics()` | `PoolMetrics` | Inspects active, idle, total, and queued pool connections. |
| `liveness()` | `{ alive: boolean, uptimeSeconds: number }` | Verifies process health and uptime. |
| `readiness()` | `Promise<{ ready: boolean, latencyMs: number, pool: PoolMetrics }>` | Executes `SELECT 1` ping and checks queue saturation. |
| `healthCheck()` | `Promise<HealthCheckResult>` | Comprehensive diagnostic combining liveness and readiness. |
| `drain(timeoutMs?)` | `Promise<void>` | Gracefully stops accepting queries and flushes active connections. |
| `close()` | `Promise<void>` | Immediately closes the MySQL connection pool. |

---

## 🔄 Atomic Transactions with Deadlock Retries

In high-concurrency environments, competing transactions accessing intersecting rows cause MySQL deadlocks (`ER_LOCK_DEADLOCK`, errno `1213` or `1205`). 

`@mysql-craft` handles transactions safely:
1. Acquires a dedicated `PoolConnection` from the pool.
2. Issues `START TRANSACTION`.
3. Passes a scoped `Transaction` client to your callback function.
4. Automatically invokes `COMMIT` upon successful resolution.
5. Catches errors, invokes `ROLLBACK`, and releases the connection back to the pool.
6. **Automatic Deadlock Retry:** If a deadlock or lock wait timeout occurs, rolls back and retries the entire callback block using exponential backoff with full jitter up to the configured retry limit.

```typescript
// Safe financial transfer with deadlock retry guarantees
await db.transaction(async (trx) => {
  const senderId = 101;
  const recipientId = 202;
  const transferAmount = 250.00;

  // 1. Check sender balance inside transaction
  const sender = await trx.queryOne<{ balance: number }>(
    'SELECT balance FROM account_balance WHERE iduser = ? FOR UPDATE',
    [senderId]
  );

  if (!sender || sender.balance < transferAmount) {
    throw new ValidationError('Insufficient funds for transfer.');
  }

  // 2. Deduct from sender
  await trx.update(
    'account_balance',
    { balance: sender.balance - transferAmount },
    'iduser = ?',
    [senderId]
  );

  // 3. Credit recipient
  await trx.query(
    'UPDATE account_balance SET balance = balance + ? WHERE iduser = ?',
    [transferAmount, recipientId]
  );

  // 4. Record audit ledger entry
  await trx.insert('transfer_ledger', {
    from_user: senderId,
    to_user: recipientId,
    amount: transferAmount,
    status: 'COMPLETED'
  });
}, {
  retries: 3,        // Retry up to 3 times on deadlock
  retryDelayMs: 200  // Base backoff delay
});
```

---

## 🔐 Security & Authentication Module

Cleanly exported from `@mysql-craft/security` (or root):

```typescript
import { Security } from '@mysql-craft';
```

### 1. Password Hashing (Bcrypt)

Uses `bcryptjs` with a secure default cost factor (salt rounds = 12):

```typescript
// Hash a password
const hash = await Security.hashPassword('MySecurePassword123!');
// Result: $2b$12$...

// Constant-time verification
const isMatch = await Security.verifyPassword('MySecurePassword123!', hash); // true
const isFake = await Security.verifyPassword('WrongPassword', hash);       // false
```

### 2. JWT Token Management & Rotation

Industry-standard dual-token rotation (short-lived Access Tokens + long-lived Refresh Tokens):

```typescript
// Generate Access + Refresh Token pair
const tokenPair = Security.generateTokenPair(
  { sub: user.iduser, email: user.email, role: user.role }, // Access payload
  { sub: user.iduser },                                     // Refresh payload
  {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpiresIn: '15m', // Default: 15m
    refreshExpiresIn: '7d'  // Default: 7d
  }
);

console.log(tokenPair);
// {
//   accessToken: "eyJhbGciOiJIUzI1Ni...",
//   refreshToken: "eyJhbGciOiJIUzI1Ni...",
//   expiresIn: "15m",
//   tokenType: "Bearer"
// }

// Verify token (throws typed AuthError if invalid or expired)
const decoded = Security.verifyToken<{ sub: number; role: string }>(
  tokenPair.accessToken,
  process.env.JWT_ACCESS_SECRET!
);
console.log(decoded.sub); // 42
```

### 3. User Record Sanitization

Strip sensitive fields (`password`, `password_hash`, `salt`, `hash`) before sending user objects over the wire:

```typescript
const rawUser = {
  iduser: 1,
  email: 'alex@company.com',
  first_name: 'Alex',
  password_hash: '$2b$12$e683h2...',
  salt: 'random_salt',
  stripe_customer_id: 'cus_99999'
};

// Strips default credentials + custom fields
const safeUser = Security.sanitizeUser(rawUser, ['stripe_customer_id']);
console.log(safeUser);
// { iduser: 1, email: 'alex@company.com', first_name: 'Alex' }
```

### 4. Cryptographic Token Generation

Generates cryptographically secure, random hexadecimal tokens for password resets, email verifications, or API keys:

```typescript
const resetToken = Security.generateSecureToken(32); // 64 hex characters
```

---

## 🔌 Express Middleware Suite

Imported from `@mysql-craft/middleware` or root:

```typescript
import {
  authenticateJwt,
  requireRole,
  validateBody,
  errorMiddleware
} from '@mysql-craft';
```

### 1. JWT Authentication Middleware

Validates the `Authorization: Bearer <token>` header, decodes the payload, and augments `req.user`:

```typescript
// Protect a route
app.get(
  '/api/me',
  authenticateJwt({ secret: process.env.JWT_ACCESS_SECRET! }),
  (req, res) => {
    // req.user is automatically typed and available
    res.json({ userId: req.user?.sub, role: req.user?.role });
  }
);

// Optional authentication (proceeds with req.user = undefined if no token provided)
app.get(
  '/api/posts',
  authenticateJwt({ secret: process.env.JWT_ACCESS_SECRET!, optional: true }),
  postsHandler
);
```

### 2. Role-Based Access Control (RBAC)

Guarantees the authenticated user possesses one of the allowed roles:

```typescript
// Require admin or superadmin role
app.delete(
  '/api/accounts/:id',
  authenticateJwt({ secret: process.env.JWT_ACCESS_SECRET! }),
  requireRole('admin', 'superadmin'),
  deleteAccountHandler
);
```

### 3. Request Body Validation

Lightweight, framework-agnostic validator compatible with custom functions, Zod, Joi, or Yup:

```typescript
app.post(
  '/api/accounts',
  validateBody((body: any) => {
    const errors: Record<string, string> = {};
    if (!body.email) errors.email = 'Email address is required.';
    if (!body.password) errors.password = 'Password is required.';
    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }),
  createAccountHandler
);
```

### 4. Centralized Error Middleware

Standardizes all application errors into a predictable JSON API structure:

```typescript
import { errorMiddleware } from '@mysql-craft';

// Register at the end of your Express middleware stack
app.use(errorMiddleware);
```

Standardized JSON output:
```json
{
  "success": false,
  "error": {
    "name": "ValidationError",
    "code": "VALIDATION_ERROR",
    "message": "Request payload validation failed.",
    "details": {
      "email": "Email address is required."
    }
  }
}
```

---

## 🌊 Resilience, Pool Management & Health Checks

### Bounded Connection Pooling & Fail-Fast 503

In standard `mysql2`, connection queues are unbounded by default (`queueLimit: 0`). When high traffic spikes exceed database capacity, requests pile up in Node.js memory indefinitely until the process crashes with an Out Of Memory (OOM) error.

`@mysql-craft` enforces **bounded connection pooling**:
- Default `connectionLimit`: `10`
- Default `queueLimit`: `connectionLimit * 10` (e.g., 100 queued requests)
- When the queue limit is reached, incoming requests fail fast with **`PoolExhaustedError`** (HTTP 503 Service Unavailable), preserving server stability and allowing upstream load balancers to shed load gracefully.

```typescript
const db = createDbClient({
  connectionLimit: 20, // 20 concurrent database connections
  queueLimit: 200      // Max 200 waiting queries before failing fast with HTTP 503
});
```

### Exponential Backoff with Full Jitter

Transient read queries (SELECT) and deadlocks are retried using AWS-recommended **Full Jitter** to prevent the "thundering herd" problem:

$$\text{Sleep} = \text{random}(0, \min(\text{maxDelay}, \text{baseDelay} \times 2^{\text{attempt}-1}))$$

```typescript
const db = createDbClient({
  retryPolicy: {
    maxAttempts: 3,     // Try up to 3 times
    baseDelayMs: 200,   // Initial delay 200ms
    maxDelayMs: 3000,   // Max delay cap 3s
    jitter: true        // Distribute uniformly across [0, exponential]
  }
});
```

### Kubernetes Liveness, Readiness & Health Checks

Easily wire up Kubernetes or Docker health probes:

```typescript
// 1. Process Liveness Probe (/healthz/live)
app.get('/healthz/live', (req, res) => {
  const live = db.liveness();
  res.status(live.alive ? 200 : 503).json(live);
});

// 2. Database Readiness Probe (/healthz/ready)
app.get('/healthz/ready', async (req, res) => {
  const ready = await db.readiness();
  res.status(ready.ready ? 200 : 503).json(ready);
});

// 3. Combined Health Endpoint (/health)
app.get('/health', async (req, res) => {
  const health = await db.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

Example `/health` response:
```json
{
  "status": "healthy",
  "timestamp": "2026-10-19T01:24:00.000Z",
  "liveness": {
    "alive": true,
    "uptimeSeconds": 3600
  },
  "readiness": {
    "ready": true,
    "latencyMs": 1.15,
    "pool": {
      "totalConnections": 15,
      "activeConnections": 2,
      "idleConnections": 13,
      "queuedRequests": 0
    }
  }
}
```

### Graceful Shutdown (Drain)

Ensure no ongoing queries are aborted during deployments or server shutdowns:

```typescript
async function shutdown() {
  console.log('Received termination signal. Draining database pool...');
  // Rejects new queries immediately, waits up to 5s for in-flight queries to finish
  await db.drain(5000);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

---

## 🎨 Visual Diagnostics, Masking & Instrumentation

### Colorized SQL Terminal Logger

When `debug: true` is enabled, queries are logged with syntax-highlighted SQL, execution latencies, and execution badges:

```text
[MYSQL] 11:34:20 AM  ⚡ 1.25ms
  SQL:    SELECT * FROM `account` WHERE `email` = ? LIMIT 1
  Params: ["alex@company.com"]
  Result: 1 row(s)

[TX:START] 11:34:20 AM [Conn #14] Transaction started.
[MYSQL] 11:34:20 AM  ⚡ 2.45ms
  SQL:    INSERT INTO `account` (`email`, `password_hash`) VALUES (?, ?)
  Params: ["alex@company.com", "********"]
  Result: 1 row(s)
[TX:COMMIT] 11:34:20 AM [Conn #14] Transaction committed.
```

- **⚡ Fast Query Badge:** Queries completing in `< 50ms`.
- **⏱ Moderate Query Badge:** Queries completing in `50ms - 200ms`.
- **🐢 Slow Query Badge:** Queries exceeding `200ms` (or custom `slowQueryThresholdMs`).

### Automatic Credential Masking

The built-in `ParameterSanitizer` automatically inspects all logged query parameters. Any object key matching sensitive patterns (`password`, `passwd`, `password_hash`, `secret`, `token`, `accesstoken`, `refreshtoken`, `jwt`, `credit_card`, `card_number`, `cvv`, `hash`, `salt`, `authorization`) is masked with `********`. Large strings (`>250` chars) and binary `Buffer` payloads are safely truncated to protect terminal performance.

### Custom Telemetry & APM Integration

Broadcast database events directly to OpenTelemetry, Datadog, or Prometheus:

```typescript
const db = createDbClient({
  host: 'localhost',
  // ...db credentials,
  instrumentation: {
    onQuery: (event) => {
      metrics.histogram('db.query.duration_ms', event.durationMs, { sql: event.sql });
    },
    onError: (event) => {
      logger.error('Database query error', { sql: event.sql, error: event.error });
    },
    onRetry: (event) => {
      metrics.increment('db.retries.total', { isDeadlock: String(event.isDeadlock) });
    },
    onTransaction: (action, connectionId) => {
      logger.info(`Transaction ${action} on connection ${connectionId}`);
    },
    onPoolMetrics: (metrics) => {
      gauge('db.pool.active', metrics.activeConnections);
      gauge('db.pool.queued', metrics.queuedRequests);
    }
  }
});
```

---

## 🔨 Pure SQL Builders & Sanitizers

Exported from `@mysql-craft/core`:

```typescript
import {
  escapeIdentifier,
  buildSelectQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildCountQuery,
  parseQueryParams
} from '@mysql-craft';
```

### Identifier Escaping
Protects table and column names by safely escaping with backticks and strictly rejecting non-alphanumeric characters:

```typescript
escapeIdentifier('users');             // "`users`"
escapeIdentifier('accounts.iduser');   // "`accounts`.`iduser`"
escapeIdentifier('users; DROP TABLE'); // Throws ValidationError
```

### Pure Query Builders
Generate safe SQL strings paired with parameter arrays without touching the database:

```typescript
// Pure INSERT builder
const { sql, params } = buildInsertQuery('account', [
  { email: 'alex@company.com', role: 'admin' },
  { email: 'beth@company.com', role: 'user' }
]);
// sql: "INSERT INTO `account` (`email`, `role`) VALUES (?, ?), (?, ?)"
// params: ["alex@company.com", "admin", "beth@company.com", "user"]
```

---

## 🚨 Error Hierarchy & HTTP Status Mapping

All errors inherit from the abstract `AppError` class and feature `isOperational: true`, allowing centralized error handlers to distinguish trusted operational errors from unknown programming bugs.

```
AppError (abstract)
 ├── DatabaseError (HTTP 500)
 ├── PoolExhaustedError (HTTP 503)
 ├── AuthError (HTTP 401 / 403)
 └── ValidationError (HTTP 400)
```

| Error Class | HTTP Status | Code | Description |
| :--- | :---: | :--- | :--- |
| `DatabaseError` | `500` | `DATABASE_ERROR` | Database query failure (contains `sql`, `errno`, `sqlState`). |
| `PoolExhaustedError` | `503` | `POOL_EXHAUSTED` | Connection pool queue limit reached. Server is saturated. |
| `AuthError.unauthorized` | `401` | `UNAUTHORIZED` | Missing or invalid authentication token. |
| `AuthError.invalidToken` | `401` | `INVALID_TOKEN` | Token corrupted or malformed signature. |
| `AuthError.tokenExpired` | `401` | `TOKEN_EXPIRED` | JWT has expired. |
| `AuthError.forbidden` | `403` | `FORBIDDEN` | Authenticated user lacks required RBAC permissions. |
| `AuthError.invalidCredentials`| `401` | `INVALID_CREDENTIALS` | Invalid email/username or password. |
| `ValidationError` | `400` | `VALIDATION_ERROR` | Request payload or parameter validation failure. |

---

## 🦾 TypeScript Integration & Type Safety

### End-to-End Type Safety with Generics

```typescript
interface Order {
  idorder: number;
  customer_id: number;
  total_amount: number;
  created_at: Date;
}

// 1. Typed queryOne returns Order | null
const order = await db.queryOne<Order>(
  'SELECT * FROM orders WHERE idorder = ?',
  [1001]
);

// 2. Typed query returns Order[]
const orders = await db.query<Order>(
  'SELECT * FROM orders WHERE customer_id = ?',
  [42]
);

// 3. Typed structured select
const topOrders = await db.select<Order>({
  table: 'orders',
  where: [{ column: 'total_amount', operator: '>', value: 500 }]
});
```

### Request User Type Augmentation

`@mysql-craft` automatically extends the Express `Request` interface:

```typescript
// Express Request interface is globally merged:
declare global {
  namespace Express {
    interface Request {
      user?: BaseTokenPayload & Record<string, any>;
    }
  }
}
```

---

## 📦 Package Subpath Exports

Import only the modules you need with clean subpath imports:

```typescript
// Root import (everything)
import { createDbClient, Security } from '@mysql-craft';

// Core database client & query builders
import { Database, BaseClient, escapeIdentifier } from '@mysql-craft/core';

// Security & auth module
import { Security } from '@mysql-craft/security';

// Express middleware
import { authenticateJwt, requireRole, errorMiddleware } from '@mysql-craft/middleware';

// Operational errors
import { DatabaseError, PoolExhaustedError, ValidationError, AuthError } from '@mysql-craft/errors';
```

---

## ⚙️ Configuration Reference

### `DatabaseConfig` (extends `mysql2.PoolOptions`)

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `host` | `string` | `'localhost'` | MySQL server hostname. |
| `port` | `number` | `3306` | MySQL server port. |
| `user` | `string` | `'root'` | Database username. |
| `password` | `string` | `''` | Database password. |
| `database` | `string` | `undefined` | Database name. |
| `connectionLimit` | `number` | `10` | Maximum number of active connections in pool. |
| `queueLimit` | `number` | `connectionLimit * 10` | Maximum queued requests before failing fast with HTTP 503. |
| `waitForConnections` | `boolean` | `true` | Whether to queue requests when pool is saturated. |
| `debug` | `boolean \| LoggerConfig` | `false` | Enables terminal SQL diagnostics with syntax highlighting. |
| `slowQueryThresholdMs` | `number` | `500` | Latency threshold (in ms) before tagging query as slow. |
| `retryPolicy` | `RetryPolicyOptions` | `{ maxAttempts: 3, baseDelayMs: 200 }` | Exponential backoff retry policy for transient errors and deadlocks. |
| `sensitiveKeys` | `string[]` | `[]` | Additional parameter keys to mask in debug logs. |
| `instrumentation` | `Instrumentation \| Instrumentation[]` | `[]` | APM and logging event listeners. |

---

## 🧪 Contributing & Development

Contributions are welcome! Please follow these steps:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/arch/mysql-craft.git
   cd mysql-craft
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run unit & integration tests:**
   ```bash
   npm test
   ```

4. **Verify TypeScript compilation:**
   ```bash
   npm run typecheck
   npm run build
   ```

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

Developed with ❤️ by the **Principal Node.js Architecture Team**.
