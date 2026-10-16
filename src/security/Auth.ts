import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AuthError, ValidationError } from '../errors';
import type { BaseTokenPayload, TokenPairResult } from './types';

/**
 * Enterprise-grade Security & Authentication helpers for password hashing and JWT management.
 */
export class Security {
  /**
   * Hashes a plaintext password using bcrypt with configurable work factor (salt rounds).
   *
   * @param password Plaintext password to hash
   * @param saltRounds Cost factor for key derivation (default: 12)
   */
  public static async hashPassword(password: string, saltRounds: number = 12): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required and must be a non-empty string.');
    }
    if (password.length > 1024) {
      throw new ValidationError('Password length exceeds maximum allowed limit.');
    }
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verifies a plaintext password against a stored bcrypt hash using constant-time comparison.
   *
   * @param password Plaintext password candidate
   * @param hash Stored bcrypt hash string
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }
    return bcrypt.compare(password, hash);
  }

  /**
   * Generates a signed JSON Web Token (JWT).
   *
   * @param payload Token payload data
   * @param secret Secret key or private key used for signing
   * @param options Additional JWT options (e.g., expiresIn, algorithm)
   */
  public static generateToken<T extends object>(
    payload: T,
    secret: string,
    options: jwt.SignOptions = { expiresIn: '1h' }
  ): string {
    if (!secret) {
      throw new AuthError('JWT signing secret must be provided.', 500, 'AUTH_CONFIG_ERROR');
    }
    return jwt.sign(payload, secret, options);
  }

  /**
   * Verifies and decodes a signed JWT. Throws strongly-typed AuthError if token
   * has expired or has an invalid signature.
   *
   * @param token Bearer JWT token string
   * @param secret Secret key used to verify the token
   * @param options Additional JWT verification options
   */
  public static verifyToken<T = BaseTokenPayload>(
    token: string,
    secret: string,
    options?: jwt.VerifyOptions
  ): T {
    if (!token) {
      throw AuthError.unauthorized('No authentication token provided.');
    }
    if (!secret) {
      throw new AuthError('JWT verification secret must be provided.', 500, 'AUTH_CONFIG_ERROR');
    }

    try {
      const decoded = jwt.verify(token, secret, options);
      return decoded as T;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        throw AuthError.tokenExpired('Authentication token has expired.');
      }
      if (err.name === 'JsonWebTokenError') {
        throw AuthError.invalidToken('Invalid or corrupted authentication token.');
      }
      throw AuthError.unauthorized(err.message);
    }
  }

  /**
   * Generates both an Access Token (short-lived) and a Refresh Token (long-lived) for rotation.
   *
   * @param accessPayload Payload for access token
   * @param refreshPayload Payload for refresh token
   * @param config Secrets and expiration settings
   */
  public static generateTokenPair<TAccess extends object, TRefresh extends object>(
    accessPayload: TAccess,
    refreshPayload: TRefresh,
    config: {
      accessSecret: string;
      refreshSecret: string;
      accessExpiresIn?: string | number;
      refreshExpiresIn?: string | number;
    }
  ): TokenPairResult {
    const accessExpiresIn = config.accessExpiresIn ?? '15m';
    const refreshExpiresIn = config.refreshExpiresIn ?? '7d';

    const accessToken = this.generateToken(accessPayload, config.accessSecret, {
      expiresIn: accessExpiresIn as any
    });

    const refreshToken = this.generateToken(refreshPayload, config.refreshSecret, {
      expiresIn: refreshExpiresIn as any
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
      tokenType: 'Bearer'
    };
  }

  /**
   * Generates a cryptographically strong, random hexadecimal token.
   * Useful for password reset tokens, email verification codes, or API keys.
   *
   * @param byteLength Number of random bytes (default: 32 -> 64 hex characters)
   */
  public static generateSecureToken(byteLength: number = 32): string {
    return crypto.randomBytes(byteLength).toString('hex');
  }

  /**
   * Safely strips sensitive fields (passwords, salts, hashes) from a user record
   * before sending it over the network in an API response.
   */
  public static sanitizeUser<T extends Record<string, any>>(
    user: T,
    extraFieldsToStrip: string[] = []
  ): Omit<T, 'password' | 'passwd' | 'hash' | 'salt'> {
    const stripped = { ...user };
    const fields = new Set([
      'password',
      'passwd',
      'password_hash',
      'hash',
      'salt',
      ...extraFieldsToStrip
    ]);

    for (const key of Object.keys(stripped)) {
      if (fields.has(key)) {
        delete (stripped as any)[key];
      }
    }

    return stripped;
  }
}
