import { describe, it, expect } from 'vitest';
import { Security } from '../src/security/Auth';
import { AuthError, ValidationError } from '../src/errors';

describe('Security & Authentication Module', () => {
  describe('Password Hashing (Native Crypto Primitives)', () => {
    it('should hash a password with native crypto scrypt and verify it correctly', async () => {
      const password = 'CorrectHorseBatteryStaple123!';
      const hash = await Security.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('scrypt:')).toBe(true);

      const isValid = await Security.verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await Security.verifyPassword('WrongPassword!', hash);
      expect(isInvalid).toBe(false);
    });

    it('should reject empty or invalid password inputs with ValidationError', async () => {
      await expect(Security.hashPassword('')).rejects.toThrow(ValidationError);
      await expect(Security.hashPassword(null as any)).rejects.toThrow(ValidationError);
    });
  });

  describe('JWT Management', () => {
    const testSecret = 'super-secret-jwt-signing-key-for-tests';

    it('should generate and verify a valid JWT token', () => {
      const payload = { sub: 'user-123', email: 'user@example.com', role: 'admin' };
      const token = Security.generateToken(payload, testSecret, { expiresIn: '1h' });

      expect(typeof token).toBe('string');

      const verified = Security.verifyToken<typeof payload>(token, testSecret);
      expect(verified.sub).toBe(payload.sub);
      expect(verified.email).toBe(payload.email);
      expect(verified.role).toBe(payload.role);
    });

    it('should generate access and refresh token pairs', () => {
      const tokens = Security.generateTokenPair(
        { sub: 42, role: 'user' },
        { sub: 42 },
        {
          accessSecret: 'access-secret-123',
          refreshSecret: 'refresh-secret-123',
          accessExpiresIn: '10m',
          refreshExpiresIn: '5d'
        }
      );

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe('10m');
    });

    it('should throw AuthError on tampered or corrupted token', () => {
      const token = Security.generateToken({ sub: 1 }, testSecret);
      const tampered = token.slice(0, -5) + 'abcde';

      expect(() => Security.verifyToken(tampered, testSecret)).toThrow(AuthError);
    });

    it('should throw AuthError.tokenExpired on expired token', async () => {
      const expiredToken = Security.generateToken({ sub: 1 }, testSecret, { expiresIn: '1ms' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(() => Security.verifyToken(expiredToken, testSecret)).toThrow(AuthError);
    });
  });

  describe('Sanitize User', () => {
    it('should strip password, password_hash, hash, and custom fields', () => {
      const rawUser = {
        iduser: 1,
        email: 'dev@company.com',
        password_hash: '$2a$12$secretHash',
        hash: 'hashVal',
        salt: 'salt123',
        stripe_customer_id: 'cus_12345'
      };

      const sanitized = Security.sanitizeUser(rawUser, ['stripe_customer_id']);

      expect(sanitized.iduser).toBe(1);
      expect(sanitized.email).toBe('dev@company.com');
      expect((sanitized as any).password_hash).toBeUndefined();
      expect((sanitized as any).hash).toBeUndefined();
      expect((sanitized as any).salt).toBeUndefined();
      expect((sanitized as any).stripe_customer_id).toBeUndefined();
    });
  });
});
