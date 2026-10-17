# @mysql-craft ⚡

A modern, lightweight, developer-friendly MySQL wrapper library for Node.js and TypeScript built on top of `mysql2/promise`. Designed to eliminate SQL injection vulnerabilities, eradicate repetitive CRUD boilerplate with **Instant 1-Line Resource Routers**, and deliver enterprise-grade Developer Experience (DX) out of the box.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-37%20Passed-brightgreen.svg)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 🚀 Key Features & Architectural Highlights

- ⚡ **Instant CRUD Resource Engine**: Generate a complete, secure Express REST API router for any database table in **a single line of code**, complete with pagination (`?page=1&limit=20`), sorting (`?sort=created_at:desc`), field projection (`?fields=id,email`), search (`?search=term`), column filtering, and lifecycle hooks.
- 🛡️ **Zero SQL Injection by Default**: Pure parameterized query generation, automatic backtick identifier escaping, and strict parameter binding across all dynamic clauses.
- 🔁 **Resilience with Full-Jitter Backoff**: Automatic retry engine with exponential backoff and uniform full jitter for reads and deadlocks (`ER_LOCK_DEADLOCK` / 1213 / 1205). Non-idempotent writes are strictly guarded.
- 🌊 **Bounded Pool Queue & Fail-Fast 503**: Finite pool queuing (`queueLimit: connectionLimit * 10`) failing fast with `PoolExhaustedError` (HTTP 503) instead of hanging indefinitely under traffic spikes.
- 🔄 **Atomic Transaction Engine**: Scoped transaction wrapper with automated `COMMIT`, rollback on failure, connection pool release guarantees, and transaction-level deadlock retries (`db.transaction(fn, { retries: 3 })`).
- 🎨 **Visual Terminal Query Diagnostics**: Colorized SQL syntax highlighting, query execution timings (<50ms ⚡, 50-200ms ⏱, >200ms 🐢), and automatic masking of sensitive credentials (`password`, `token`, `secret`, `hash`).
- 📊 **Pluggable Instrumentation**: Decoupled events (`onQuery`, `onError`, `onRetry`, `onTransaction`, `onPoolMetrics`) for logging, OpenTelemetry, Datadog, or Prometheus APM integration.
- 🔐 **Integrated Security & Auth Module**: Industrial-strength Bcrypt password hashing (cost factor 12) and dual JWT token rotation (Access + Refresh tokens).
- 🔌 **Enterprise Express Middleware**: Drop-in JWT authentication with Request type declaration merging, role-based authorization (RBAC), and centralized error handling.
- 📦 **Subpath Package Exports**: Native clean imports for `@mysql-craft/core`, `@mysql-craft/security`, `@mysql-craft/middleware`, and `@mysql-craft/errors`.

---

## 📦 Installation

```bash
npm install @mysql-craft mysql2
```

Optional peer dependencies for web middleware:
```bash
npm install express
npm install -D @types/express
```

---

## ⚡ Instant CRUD Resource Engine (1-Line API Generation)

Stop writing boilerplate controllers for basic database tables. `db.createResourceRouter()` generates a fully featured, hardened Express router:

```typescript
import express from 'express';
import { createDbClient, Security } from '@mysql-craft';

const app = express();
app.use(express.json());

const db = createDbClient({
  host: 'localhost',
  user: 'root',
  password: 'db_password',
  database: 'production_db',
  connectionLimit: 15,
  debug: process.env.NODE_ENV !== 'production'
});

// Single-line instant CRUD REST API
app.use('/api/accounts', db.createResourceRouter('account', {
  primaryKey: 'iduser',
  allowedFields: ['iduser', 'email', 'first_name', 'last_name', 'role', 'created_at'],
  readOnlyFields: ['iduser', 'created_at'], // Cannot be mutated by clients on POST/PUT
  hiddenFields: ['password_hash'],           // Never returned in HTTP responses
  searchableFields: ['email', 'first_name', 'last_name'],
  defaultLimit: 20,
  maxLimit: 100,
  auth: { secret: process.env.JWT_ACCESS_SECRET! }, // Enforces Bearer token
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
```

### URL Query Parameter Automation:
- **Pagination**: `GET /api/accounts?page=2&limit=25` -> returns `{ data: [...], meta: { total: 100, page: 2, limit: 25, totalPages: 4, hasNext: true, hasPrev: true } }`
- **Sorting**: `GET /api/accounts?sort=created_at:desc,first_name:asc` or `-created_at,first_name`
- **Field Projection**: `GET /api/accounts?fields=iduser,email,first_name` (strictly whitelisted against `allowedFields`)
- **Full Search**: `GET /api/accounts?search=alex` (applies `LIKE ?` across all configured `searchableFields`)
- **Column Filtering**: `GET /api/accounts?role=admin` (exact parameterized matching)

---

## 🛡️ Core Database API & Safety

### 1. Safe Parameterized Queries
```typescript
interface User {
  iduser: number;
  email: string;
  first_name: string;
}

// Fetch single typed record or null
const user = await db.queryOne<User>(
  'SELECT iduser, email, first_name FROM account WHERE iduser = ?',
  [42]
);

// Fetch list of records
const activeUsers = await db.query<User>(
  'SELECT * FROM account WHERE role = ? ORDER BY created_at DESC',
  ['admin']
);
```

### 2. High-Level Parameterized Insert & Batch Insert
```typescript
// Single insert
const { insertId } = await db.insert('account', {
  email: 'alex@company.com',
  first_name: 'Alex',
  last_name: 'Rivera',
  password_hash: await Security.hashPassword('Secret123!')
});

// Bulk insert
await db.insert('account_profile', [
  { iduser: insertId, phone: '555-0199', bio: 'Engineer' },
  { iduser: 2, phone: '555-0200', bio: 'Designer' }
]);
```

### 3. Atomic Transactions with Deadlock Retries
If two concurrent transactions deadlock (`ER_LOCK_DEADLOCK` / 1213 / 1205), `@mysql-craft` automatically rolls back and retries the entire transaction with full jitter up to the configured limit:

```typescript
const order = await db.transaction(async (trx) => {
  const result = await trx.insert('orders', { customer_id: 123, total: 99.50 });
  await trx.insert('order_items', { order_id: result.insertId, product_id: 456 });
  return trx.queryOne('SELECT * FROM orders WHERE id = ?', [result.insertId]);
}, { retries: 3, retryDelayMs: 200 });
```

---

## 🎨 Visual Terminal Logging & Instrumentation

When `debug: true` is enabled, queries output formatted diagnostics with SQL syntax highlighting, colorized execution latencies, and **masked credentials**:

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

### Custom Instrumentation (APM / Prometheus / Datadog)
```typescript
const db = createDbClient({
  // ...db credentials,
  instrumentation: {
    onQuery: (event) => metrics.recordHistogram('db_query_duration_ms', event.durationMs),
    onError: (event) => logger.error({ sql: event.sql, err: event.error }),
    onRetry: (event) => metrics.increment('db_retries_total')
  }
});
```

---

## 🌊 Health Checks & Graceful Drain

```typescript
// 1. Process Liveness (Process is running and not draining)
const live = db.liveness(); // { alive: true, uptimeSeconds: 120 }

// 2. Database Readiness (SELECT 1 ping + pool saturation check)
const ready = await db.readiness(); // { ready: true, latencyMs: 1.2, pool: { totalConnections: 10, ... } }

// 3. Combined Health Check
const health = await db.healthCheck();

// 4. Graceful Shutdown on SIGTERM / SIGINT
process.on('SIGTERM', async () => {
  console.log('Draining database connections...');
  await db.drain(5000); // 5s timeout
  process.exit(0);
});
```

---

## 🔐 Security & Auth Helpers

```typescript
import { Security } from '@mysql-craft/security';

// 1. Password Hashing (Bcrypt, 12 rounds)
const hash = await Security.hashPassword('PlaintextP@ssw0rd');
const isValid = await Security.verifyPassword('PlaintextP@ssw0rd', hash);

// 2. JWT Access + Refresh Token Rotation
const tokens = Security.generateTokenPair(
  { sub: user.iduser, role: user.role },
  { sub: user.iduser },
  {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpiresIn: '15m',
    refreshExpiresIn: '7d'
  }
);

// 3. Sanitize User Record (Strips sensitive keys before API responses)
const safeUser = Security.sanitizeUser(user);
```

---

## 📦 Subpath Package Exports

Import exactly what you need cleanly:
```typescript
import { createDbClient } from '@mysql-craft';
import { BaseClient, escapeIdentifier, buildSelectQuery } from '@mysql-craft/core';
import { Security } from '@mysql-craft/security';
import { authenticateJwt, requireRole } from '@mysql-craft/middleware';
import { DatabaseError, PoolExhaustedError, AuthError } from '@mysql-craft/errors';
```

---

## 🧪 Testing

Run the complete Vitest test suite covering pure SQL builders, parameter sanitization, retry engines, and resource routers:

```bash
npm run test
```

---

## 📜 License

MIT © [Principal Node.js Architect]
