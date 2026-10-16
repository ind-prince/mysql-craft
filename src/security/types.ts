import type { SignOptions, VerifyOptions } from 'jsonwebtoken';

/**
 * Standard base structure for JWT payload.
 */
export interface BaseTokenPayload {
  sub: string | number; // Subject / User ID
  email?: string;
  role?: string;
  [key: string]: any;
}

/**
 * Configuration options for generating JWT tokens.
 */
export interface TokenGenerationOptions extends SignOptions {
  secret: string;
}

/**
 * Result of generating both access and refresh token pairs.
 */
export interface TokenPairResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string | number;
  tokenType: 'Bearer';
}

/**
 * Configuration options for verifying JWT tokens.
 */
export interface TokenVerificationOptions extends VerifyOptions {
  secret: string;
}
