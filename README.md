# mysql-craft ⚡

[![npm version](https://img.shields.io/npm/v/mysql-craft.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/mysql-craft)
[![Documentation](https://img.shields.io/badge/docs-website-brightgreen.svg?style=flat-square)](https://ind-prince.github.io/docs.mysql-craft/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178c6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-37%20Passed-6e9f18.svg?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Downloads](https://img.shields.io/npm/dm/mysql-craft.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/mysql-craft)

> **Modern, lightweight, developer-friendly MySQL engine for Node.js & TypeScript.**  
> Eliminates SQL injection by default, eradicates boilerplate with **Instant 1-Line CRUD Routers**, automatically recovers from deadlocks with full-jitter retries, enforces bounded connection pool safety (fail-fast HTTP 503), and provides built-in auth & visual diagnostics.

---

> 📖 **Full Interactive Documentation & API Guides**:  
> 👉 **[https://ind-prince.github.io/docs.mysql-craft/](https://ind-prince.github.io/docs.mysql-craft/)**

---

### 🚀 Quick Links

- [📚 Full Documentation](https://ind-prince.github.io/docs.mysql-craft/)
- [📦 NPM Package](https://www.npmjs.com/package/mysql-craft)
- [🐙 GitHub Repository](https://github.com/ind-prince/mysql-craft)
- [🐛 Issue Tracker](https://github.com/ind-prince/mysql-craft/issues)

---

## 💡 Why mysql-craft?

Writing direct MySQL code in Node.js applications frequently leads to recurring architectural liabilities:
- **SQL Injection Risks:** Inadvertent string concatenation or unescaped identifiers.
- **CRUD Boilerplate:** Hundreds of lines of redundant controllers, services, and queries.
- **Connection Starvation:** Unbounded pool queues cause Node.js processes to crash with Out Of Memory (OOM) under load.
- **Unhandled Deadlocks:** Transient MySQL lock deadlocks crash concurrent operations without automated retries.
- **Credential Leaks:** Plaintext passwords and tokens printed in raw SQL terminal logs.

`mysql-craft` eliminates these risks with zero runtime overhead and an exceptional developer experience.

### ⚖️ Architectural Comparison

| Feature | Raw `mysql2` | Prisma / TypeORM | Knex.js | `mysql-craft` |
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

```bash
# Using npm
npm install mysql-craft mysql2

# Using pnpm
pnpm add mysql-craft mysql2

# Using yarn
yarn add mysql-craft mysql2

# Using bun
bun add mysql-craft mysql2
```

> **Peer Dependency**: If utilizing the Instant CRUD Resource Engine or Express Middleware Suite, install `express`:
> ```bash
> npm install express
> npm install -D @types/express
> ```

---

## ⚡ Quick Start

### 1. Initialize the Client

```typescript
import { createDbClient } from 'mysql-craft';

export const db = createDbClient({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'ecommerce_db',
  connectionLimit: 15,
  debug: process.env.NODE_ENV !== 'production' // Colorized terminal logger in dev
});
```

### 2. Type-Safe Parameterized Queries & Mutations

```typescript
interface User {
  iduser: number;
  email: string;
  role: 'user' | 'admin';
}

// 1. Fetch single record (returns User or null)
const user = await db.queryOne<User>(
  'SELECT iduser, email, role FROM account WHERE email = ? LIMIT 1',
  ['alex@company.com']
);

// 2. Fetch typed list
const admins = await db.query<User>(
  'SELECT * FROM account WHERE role = ?',
  ['admin']
);

// 3. High-level Insert, Update, Delete helpers
const result = await db.insert('account', {
  email: 'newuser@company.com',
  role: 'user'
});
console.log(`Created user #${result.insertId}`);

await db.update('account', { role: 'admin' }, 'iduser = ?', [result.insertId]);
await db.delete('account', 'iduser = ?', [result.insertId]);
```

### 3. Atomic Transactions with Deadlock Retries

Deadlocks (`ER_LOCK_DEADLOCK` / errno `1213`) are automatically caught and retried using exponential backoff with full jitter:

```typescript
await db.transaction(async (trx) => {
  const sender = await trx.queryOne<{ balance: number }>(
    'SELECT balance FROM account_balance WHERE iduser = ? FOR UPDATE',
    [101]
  );

  if (!sender || sender.balance < 50) {
    throw new Error('Insufficient balance');
  }

  await trx.update('account_balance', { balance: sender.balance - 50 }, 'iduser = ?', [101]);
  await trx.query('UPDATE account_balance SET balance = balance + ? WHERE iduser = ?', [50, 202]);
}, {
  retries: 3,        // Retry up to 3 times on deadlock
  retryDelayMs: 200  // Base backoff delay
});
```

---

## 🚀 Instant CRUD Resource Engine (1-Line REST API)

Generate an enterprise-grade, hardened Express CRUD router in **a single line**:

```typescript
import express from 'express';
import { createDbClient } from 'mysql-craft';

const app = express();
app.use(express.json());
const db = createDbClient({ /* config */ });

// Mount complete REST API for table "account" under /api/accounts
app.use('/api/accounts', db.createResourceRouter('account', {
  primaryKey: 'iduser',
  allowedFields: ['iduser', 'email', 'first_name', 'last_name', 'role', 'created_at'],
  readOnlyFields: ['iduser', 'created_at'],
  hiddenFields: ['password_hash'],
  searchableFields: ['email', 'first_name', 'last_name'],
  defaultLimit: 20,
  maxLimit: 100
}));

app.listen(3000, () => console.log('API listening on http://localhost:3000'));
```

### Auto-Generated Endpoints

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Paginated listing with filtering, sorting, field selection, and search | `200 OK` |
| `GET` | `/:id` | Fetch single record by primary key | `200 OK`, `404 Not Found` |
| `POST` | `/` | Create record (strips read-only fields & runs hooks) | `201 Created`, `400 Bad Request` |
| `PUT` | `/:id` | Full update of existing record | `200 OK`, `404 Not Found` |
| `PATCH`| `/:id` | Partial update of existing record | `200 OK`, `404 Not Found` |
| `DELETE`| `/:id` | Remove record by primary key | `200 OK`, `404 Not Found` |

> 📖 **Learn more**: Check the [CRUD Router Documentation](https://ind-prince.github.io/docs.mysql-craft/) for query parameters (`?page=`, `?sort=`, `?fields=`, `?search=`), authentication, and lifecycle hooks (`beforeCreate`, `afterUpdate`).

---

## 🔐 Security & Express Middleware

### Password Hashing & JWT Token Management

```typescript
import { Security } from 'mysql-craft';

// 1. Password Hashing (Bcrypt with cost factor 12)
const hash = await Security.hashPassword('SuperSecret123!');
const isValid = await Security.verifyPassword('SuperSecret123!', hash);

// 2. JWT Access + Refresh Token Rotation
const tokens = Security.generateTokenPair(
  { sub: 42, role: 'admin' },
  { sub: 42 },
  { accessSecret: process.env.JWT_ACCESS_SECRET!, refreshSecret: process.env.JWT_REFRESH_SECRET! }
);

// 3. User Record Sanitization (strips password, hashes, and custom sensitive fields)
const safeUser = Security.sanitizeUser(userRecord);
```

### Express Middleware Suite

```typescript
import { authenticateJwt, requireRole, errorMiddleware } from 'mysql-craft';

// Protect route with JWT authentication
app.get('/api/me', authenticateJwt({ secret: process.env.JWT_ACCESS_SECRET! }), (req, res) => {
  res.json({ user: req.user });
});

// Enforce Role-Based Access Control (RBAC)
app.delete('/api/accounts/:id', authenticateJwt({ secret: process.env.JWT_ACCESS_SECRET! }), requireRole('admin'), deleteHandler);

// Centralized operational error middleware
app.use(errorMiddleware);
```

---

## 🌊 Resilience, Diagnostics & Production

- **Bounded Connection Pool:** Enforces `queueLimit: connectionLimit * 10`. Fails fast with `PoolExhaustedError` (HTTP 503) instead of leaking memory and causing OOM crashes.
- **Colorized SQL Logger:** Pretty prints SQL statements, execution times (`⚡ 1.25ms`), and row counts.
- **Automatic Credential Masking:** Automatically masks sensitive keys (`password`, `token`, `secret`, `credit_card`) in logs.
- **Kubernetes Health Probes:** Built-in `db.liveness()`, `db.readiness()`, and `db.healthCheck()`.
- **Graceful Shutdown:** `await db.drain(5000)` flushes in-flight queries before container termination.

---

## 📦 Modular Subpath Imports

Import only what you need to keep bundles ultra-lean:

```typescript
// All-in-one root import
import { createDbClient, Security, authenticateJwt } from 'mysql-craft';

// Core database client & query builders
import { Database, BaseClient, escapeIdentifier, buildInsertQuery } from 'mysql-craft/core';

// Security & auth utilities
import { Security } from 'mysql-craft/security';

// Express middleware
import { authenticateJwt, requireRole, errorMiddleware, validateBody } from 'mysql-craft/middleware';

// Typed operational errors
import { DatabaseError, PoolExhaustedError, ValidationError, AuthError } from 'mysql-craft/errors';
```

---

## 📚 Complete Documentation

Visit the official documentation portal for detailed guides and exhaustive API references:

👉 **[https://ind-prince.github.io/docs.mysql-craft/](https://ind-prince.github.io/docs.mysql-craft/)**

- [Getting Started & Configuration Guide](https://ind-prince.github.io/docs.mysql-craft/)
- [Instant CRUD Engine & Lifecycle Hooks](https://ind-prince.github.io/docs.mysql-craft/)
- [Database API & Query Builders](https://ind-prince.github.io/docs.mysql-craft/)
- [Transactions & Deadlock Handling](https://ind-prince.github.io/docs.mysql-craft/)
- [Security, Bcrypt & JWT Rotation](https://ind-prince.github.io/docs.mysql-craft/)
- [APM Telemetry Hooks (OpenTelemetry, Datadog, Prometheus)](https://ind-prince.github.io/docs.mysql-craft/)
- [Kubernetes & Docker Deployment](https://ind-prince.github.io/docs.mysql-craft/)

---

## 🧪 Contributing & Development

```bash
# 1. Clone repository
git clone https://github.com/ind-prince/mysql-craft.git
cd mysql-craft

# 2. Install dependencies
npm install

# 3. Run test suite
npm test

# 4. Build package
npm run build
```

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

<p align="center">
  Crafted with ❤️ by <a href="https://github.com/ind-prince">ind-prince</a>
</p>
