# @arch/mysql-craft ⚡

A modern, lightweight, developer-friendly MySQL wrapper library for Node.js and TypeScript built on top of `mysql2/promise`. Designed to eradicate SQL injection vulnerabilities, eliminate repetitive boilerplate, and deliver enterprise-grade Developer Experience (DX) out of the box.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Zero-Vulnerability](https://img.shields.io/badge/Vulnerabilities-0-brightgreen.svg)]()

---

## 🚀 Key Features & Architectural Philosophy

- 🛡️ **Built-in Security Defaults**: Strictly parameterized queries, automatic backtick identifier escaping, and zero template-literal string injection risks.
- 🔄 **Automatic Transaction Management**: Scoped transaction lifecycle with automatic `COMMIT` on success and safe `ROLLBACK` on error with connection pool return guarantees.
- 🎨 **Visual Terminal Query Logger**: Colorized SQL syntax highlighting, query execution timings (<50ms ⚡, 50-200ms ⏱, >200ms 🐢), and automatic masking of sensitive credentials (passwords, tokens, credit cards).
- 🔁 **Transient Retry Engine**: Automatic exponential backoff retries for transient MySQL network blips (`PROTOCOL_CONNECTION_LOST`, `ECONNRESET`, `ER_LOCK_DEADLOCK`).
- 🔐 **Integrated Security & Auth Module**: Industrial-strength password hashing with Bcrypt and JWT token rotation helpers.
- 🔌 **Ready-to-use Express Middleware**: Drop-in JWT authentication with Request type declaration merging, role-based authorization (RBAC), and centralized error handling.
- 📦 **100% Strongly Typed**: First-class TypeScript generics for all query results without ever needing `any`.

---

## 📦 Installation

```bash
npm install @arch/mysql-craft mysql2
```

Optional peer dependencies for web middleware:
```bash
npm install express
npm install -D @types/express
```

---

## ⚡ Quick Start

```typescript
import { createDbClient, Security } from '@arch/mysql-craft';

// 1. Initialize Client with Connection Pool
const db = createDbClient({
  host: 'localhost',
  user: 'root',
  password: 'db_password',
  database: 'production_db',
  connectionLimit: 15,
  debug: process.env.NODE_ENV !== 'production' // Colorized terminal output in dev
});

// 2. Fetch Single Typed Record Safely
interface User {
  iduser: number;
  email: string;
  first_name: string;
}

const user = await db.queryOne<User>(
  'SELECT iduser, email, first_name FROM account WHERE iduser = ?',
  [42]
);

// 3. Safe Parameterized Insertion
const result = await db.insert('account', {
  email: 'dev@company.com',
  first_name: 'Alex',
  last_name: 'Rivera',
  password_hash: await Security.hashPassword('SuperSecret123!')
});

console.log(`Inserted User ID: ${result.insertId}`);
```

---

## 🎨 Visual Terminal Logging

When `debug: true` is enabled, every query prints formatted diagnostics directly to the terminal:

```
[MYSQL] 11:34:20 AM  ⚡ 1.42ms
  SQL:    SELECT * FROM `account` WHERE `email` = ? LIMIT 1
  Params: ["dev@company.com"]
  Result: 1 row(s)

[TX:START] 11:34:20 AM [Conn #14] Transaction started.
[MYSQL] 11:34:20 AM  ⚡ 2.10ms
  SQL:    INSERT INTO `account` (`email`, `password_hash`) VALUES (?, ?)
  Params: ["dev@company.com", "********"]
  Result: 1 row(s)
[TX:COMMIT] 11:34:20 AM [Conn #14] Transaction committed.
```

Sensitive fields (`password`, `token`, `secret`, `hash`) are **automatically masked** to keep terminal logs leak-free.

---

## 🛡️ Core Database API

### 1. `db.query<T>(sql, params)`
Executes a parameterized read query and returns an array of typed records:
```typescript
const activeUsers = await db.query<User>(
  'SELECT * FROM account WHERE status = ? ORDER BY created_at DESC',
  ['active']
);
```

### 2. `db.queryOne<T>(sql, params)`
Executes a query and returns the first row or `null` if no match:
```typescript
const account = await db.queryOne<User>(
  'SELECT * FROM account WHERE email = ? LIMIT 1',
  [email]
);
```

### 3. `db.insert(table, record | records[])`
Safely inserts single or batch records with automatic identifier escaping and parameter binding:
```typescript
// Single insert
const { insertId } = await db.insert('orders', {
  user_id: 10,
  amount: 250.00
});

// Bulk insert
await db.insert('order_items', [
  { order_id: insertId, item_sku: 'ITEM-1', qty: 2 },
  { order_id: insertId, item_sku: 'ITEM-2', qty: 1 }
]);
```

### 4. `db.update(table, data, whereClause, whereParams)`
Safely updates records:
```typescript
const { affectedRows } = await db.update(
  'account',
  { first_name: 'Alexander', status: 'verified' },
  'iduser = ?',
  [userId]
);
```

### 5. `db.transaction<T>(callback)`
Executes operations inside an atomic transaction. Automatically commits if the callback resolves, and rolls back if an exception is thrown:
```typescript
const newOrder = await db.transaction(async (trx) => {
  const order = await trx.insert('orders', { customer_id: 123, total: 99.50 });
  await trx.insert('order_items', { order_id: order.insertId, product_id: 456 });
  
  // You can execute queries inside the transaction
  const details = await trx.queryOne('SELECT * FROM orders WHERE id = ?', [order.insertId]);
  return details;
});
```

### 6. `db.healthCheck()`
Pings the database and reports pool health metrics:
```typescript
const health = await db.healthCheck();
// { status: 'healthy', latencyMs: 1.25, pool: { totalConnections: 10, activeConnections: 1, idleConnections: 9, queuedRequests: 0 } }
```

---

## 🔐 Security & Auth Module

### Password Hashing
Uses Bcrypt with configurable salt rounds:
```typescript
import { Security } from '@arch/mysql-craft';

// Hash password with optimal cost factor (12 rounds)
const hash = await Security.hashPassword('PlaintextP@ssw0rd');

// Verify candidate against stored hash (constant-time)
const isValid = await Security.verifyPassword('PlaintextP@ssw0rd', hash);
```

### JWT Management & Token Pairs
```typescript
// Generate access & refresh tokens
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

// Verify and decode token
const payload = Security.verifyToken(tokens.accessToken, process.env.JWT_ACCESS_SECRET!);
```

### Record Sanitization
Strips sensitive fields before returning responses to clients:
```typescript
const safeUser = Security.sanitizeUser(user);
// Removes 'password', 'password_hash', 'hash', 'salt', etc.
```

---

## 🔌 Express Middleware Integration

```typescript
import express from 'express';
import {
  authenticateJwt,
  requireRole,
  validateBody,
  errorMiddleware
} from '@arch/mysql-craft';

const app = express();
app.use(express.json());

// 1. Protected Route with User Authentication
app.get(
  '/api/profile',
  authenticateJwt({ secret: process.env.JWT_ACCESS_SECRET! }),
  (req, res) => {
    // req.user is typed with subject, role, and payload attributes
    res.json({ user: req.user });
  }
);

// 2. Role-Based Access Control (RBAC)
app.delete(
  '/api/admin/users/:id',
  authenticateJwt({ secret: process.env.JWT_ACCESS_SECRET! }),
  requireRole('admin', 'superadmin'),
  async (req, res) => {
    // Only executed if user has 'admin' or 'superadmin' role
    res.json({ message: 'User deleted' });
  }
);

// 3. Centralized Error Handler
app.use(errorMiddleware);
```

---

## 📊 Legacy Anti-Pattern vs. Modern Pattern

| Concern | Legacy MySQL Node Code | With `@arch/mysql-craft` |
| :--- | :--- | :--- |
| **SQL Injection** | Severe: Template strings (`'${input}'`) | **Zero Risk**: Forced parameterization & identifier escaping |
| **Transactions** | Fragile: Manual `BEGIN`, `COMMIT`, unhandled rollbacks | **Atomic**: Automatic commit & rollback wrapper |
| **Typing** | Cluttered `any[]` or manual casting | **Type-safe**: Generics `db.query<User>()` |
| **Logging** | Silent or primitive `console.log(err)` | **Terminal Diagnostics**: Colorized SQL, latency, & masked credentials |
| **Authentication** | Mixed directly into SQL queries | **Decoupled**: Native `Security` helpers and middleware |
| **Connection Leaks** | Frequent due to missing `conn.release()` | **Leak-proof**: Managed connection pool lifecycle |

---

## 📜 License

MIT © [Principal Node.js Architect]
