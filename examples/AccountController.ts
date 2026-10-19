/**
 * ============================================================================
 * ARCHITECTURAL CASE STUDY & COMPARISON
 * Legacy Anti-Pattern vs. Modern mysql-craft Pattern
 * ============================================================================
 */

import type { Request, Response, NextFunction } from 'express';
import { createDbClient, Security, ValidationError, AuthError } from '../src';

// ----------------------------------------------------------------------------
// 1. DATA CONTRACTS & DOMAIN INTERFACES
// ----------------------------------------------------------------------------

export interface UserAccount {
  iduser: number;
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  role: 'user' | 'admin';
  created_at: Date;
  updated_at: Date;
}

export interface UserProfile {
  iduser: number;
  phone?: string;
  bio?: string;
  avatar_url?: string;
}

// ----------------------------------------------------------------------------
// 2. DATABASE CLIENT INITIALIZATION
// ----------------------------------------------------------------------------

export const db = createDbClient({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'production_app',
  connectionLimit: 15,
  debug: process.env.NODE_ENV !== 'production' // Colorized execution log in dev
});

// ----------------------------------------------------------------------------
// 3. REFACTORED ACCOUNT CONTROLLER (Clean, Type-Safe, Production-Ready)
// ----------------------------------------------------------------------------

export class AccountController {
  /**
   * Safe User Registration with Transactional Consistency
   *
   * Pain Points Solved:
   * 1. SQL Injection: Automatically prevented via parameterized .insert()
   * 2. Atomic Operations: Account and Profile are inserted inside db.transaction()
   * 3. Password Security: Bcrypt hashing with optimal work factor (cost 12)
   * 4. Error Handling: Throws operational errors (ValidationError) caught cleanly
   */
  public static async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password, firstName, lastName, phone, bio } = req.body;

      if (!email || !password || !firstName || !lastName) {
        throw new ValidationError('Missing required fields for registration.');
      }

      // Check if user already exists (Safe parameterized SELECT)
      const existingUser = await db.queryOne<{ iduser: number }>(
        'SELECT iduser FROM account WHERE email = ? LIMIT 1',
        [email]
      );

      if (existingUser) {
        throw new ValidationError('An account with this email address already exists.');
      }

      // Secure password hashing
      const passwordHash = await Security.hashPassword(password);

      // Atomic Transaction: Insert user record and user profile together
      const createdAccount = await db.transaction(async (trx) => {
        // 1. Insert main account
        const accountInsert = await trx.insert('account', {
          email,
          first_name: firstName,
          last_name: lastName,
          password_hash: passwordHash,
          role: 'user'
        });

        const newUserId = accountInsert.insertId;

        // 2. Insert complementary profile
        await trx.insert('account_profile', {
          iduser: newUserId,
          phone: phone || null,
          bio: bio || null
        });

        // 3. Retrieve typed fresh user record inside the same transaction
        const newUser = await trx.queryOne<UserAccount>(
          'SELECT * FROM account WHERE iduser = ?',
          [newUserId]
        );

        return newUser;
      });

      if (!createdAccount) {
        throw new Error('Failed to retrieve newly created account.');
      }

      // Generate JWT Access & Refresh Token Pair
      const tokens = Security.generateTokenPair(
        { sub: createdAccount.iduser, email: createdAccount.email, role: createdAccount.role },
        { sub: createdAccount.iduser },
        {
          accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345',
          refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-12345'
        }
      );

      res.status(201).json({
        success: true,
        message: 'Account registered successfully.',
        data: {
          user: Security.sanitizeUser(createdAccount),
          tokens
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Safe User Authentication (Login)
   *
   * Pain Points Solved:
   * 1. SQL Injection: Parameterized query prevents quote-injection attacks
   * 2. Constant-Time Verification: Prevents timing attacks on passwords
   * 3. Masked Console Logs: Password hashes won't leak in dev terminal output
   */
  public static async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new ValidationError('Email and password must be provided.');
      }

      const user = await db.queryOne<UserAccount>(
        'SELECT * FROM account WHERE email = ? LIMIT 1',
        [email]
      );

      if (!user) {
        throw AuthError.invalidCredentials();
      }

      // Constant-time bcrypt comparison
      const isPasswordValid = await Security.verifyPassword(password, user.password_hash);
      if (!isPasswordValid) {
        throw AuthError.invalidCredentials();
      }

      // Generate auth tokens
      const tokens = Security.generateTokenPair(
        { sub: user.iduser, email: user.email, role: user.role },
        { sub: user.iduser },
        {
          accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345',
          refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-12345'
        }
      );

      res.status(200).json({
        success: true,
        message: 'Login successful.',
        data: {
          user: Security.sanitizeUser(user),
          tokens
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Fetch Current Authenticated Account Details
   */
  public static async getProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw AuthError.unauthorized();
      }

      // Parameterized JOIN with typed return
      const profileData = await db.queryOne<UserAccount & UserProfile>(
        `SELECT
           a.iduser, a.email, a.first_name, a.last_name, a.role, a.created_at,
           p.phone, p.bio, p.avatar_url
         FROM account a
         LEFT JOIN account_profile p ON a.iduser = p.iduser
         WHERE a.iduser = ? LIMIT 1`,
        [userId]
      );

      if (!profileData) {
        throw new ValidationError('User profile not found.');
      }

      res.status(200).json({
        success: true,
        data: Security.sanitizeUser(profileData)
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update Profile Information
   */
  public static async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.sub;
      const { firstName, lastName, phone, bio } = req.body;

      if (!userId) {
        throw AuthError.unauthorized();
      }

      await db.transaction(async (trx) => {
        // Safe update with automatic escaping and parameterization
        if (firstName || lastName) {
          await trx.update(
            'account',
            {
              ...(firstName ? { first_name: firstName } : {}),
              ...(lastName ? { last_name: lastName } : {})
            },
            'iduser = ?',
            [userId]
          );
        }

        if (phone !== undefined || bio !== undefined) {
          await trx.update(
            'account_profile',
            {
              ...(phone !== undefined ? { phone } : {}),
              ...(bio !== undefined ? { bio } : {})
            },
            'iduser = ?',
            [userId]
          );
        }
      });

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully.'
      });
    } catch (err) {
      next(err);
    }
  }
}

// ----------------------------------------------------------------------------
// 4. INSTANT CRUD RESOURCE ENGINE (Zero Boilerplate, 1-Line Generation)
// ----------------------------------------------------------------------------
//
// For standard administration or RESTful table access, developers no longer
// need to write repetitive CRUD controllers. The single line below generates
// a complete Express router featuring:
//   - ?page=1&limit=20 pagination metadata
//   - ?sort=created_at:desc or ?sort=first_name:asc safe sorting
//   - ?fields=iduser,email,first_name field projection
//   - ?search=keyword multi-column LIKE search
//   - ?role=admin exact column filters
//   - Automatic stripping of readOnlyFields ('iduser', 'created_at') on writes
//   - Automatic masking of hiddenFields ('password_hash') on responses
//   - Built-in JWT authentication & role-based access control
//
export const accountCrudRouter = db.createResourceRouter('account', {
  primaryKey: 'iduser',
  allowedFields: ['iduser', 'email', 'first_name', 'last_name', 'role', 'created_at'],
  readOnlyFields: ['iduser', 'created_at'],
  hiddenFields: ['password_hash'],
  searchableFields: ['email', 'first_name', 'last_name'],
  defaultLimit: 20,
  maxLimit: 100,
  auth: { secret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345' },
  hooks: {
    beforeCreate: async (data) => {
      if (data.password) {
        data.password_hash = await Security.hashPassword(data.password);
        delete data.password;
      }
      return data;
    }
  }
});

