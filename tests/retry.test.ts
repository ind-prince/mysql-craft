import { describe, it, expect } from 'vitest';
import { ParameterSanitizer } from '../src/core/Instrumentation';
import { PoolExhaustedError, DatabaseError } from '../src/errors';

describe('Resilience, Parameter Masking & Jitter', () => {
  describe('ParameterSanitizer', () => {
    it('should mask sensitive credential keys in objects', () => {
      const sanitizer = new ParameterSanitizer();
      const params = [
        'normal_user',
        {
          email: 'user@example.com',
          password: 'plain_password',
          password_hash: '$2b$12$hash',
          secret: 'top_secret',
          token: 'bearer.token.jwt',
          normalField: 'visible'
        }
      ];

      const sanitized: any = sanitizer.sanitize(params);
      expect(sanitized[0]).toBe('normal_user');
      expect(sanitized[1].email).toBe('user@example.com');
      expect(sanitized[1].password).toBe('********');
      expect(sanitized[1].password_hash).toBe('********');
      expect(sanitized[1].secret).toBe('********');
      expect(sanitized[1].token).toBe('********');
      expect(sanitized[1].normalField).toBe('visible');
    });

    it('should truncate excessively long strings to protect dev logs', () => {
      const sanitizer = new ParameterSanitizer({ maxStringLength: 50 });
      const hugeString = 'a'.repeat(300);
      const sanitized: any = sanitizer.sanitize([hugeString]);

      expect(typeof sanitized[0]).toBe('string');
      expect(sanitized[0].length).toBeLessThan(100);
      expect(sanitized[0]).toContain('... [truncated, length: 300]');
    });

    it('should format binary Buffers without dumping raw binary content', () => {
      const sanitizer = new ParameterSanitizer();
      const buffer = Buffer.from('hello world binary payload');
      const sanitized: any = sanitizer.sanitize([buffer]);

      expect(sanitized[0]).toBe(`<Buffer len=${buffer.length}>`);
    });
  });

  describe('Error Classes & HTTP Mapping', () => {
    it('should properly configure PoolExhaustedError with HTTP 503', () => {
      const error = new PoolExhaustedError('Pool saturated');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('POOL_EXHAUSTED');
      expect(error.isOperational).toBe(true);

      const json = error.toJSON();
      expect(json.statusCode).toBe(503);
      expect(json.code).toBe('POOL_EXHAUSTED');
    });

    it('should properly configure DatabaseError with HTTP 500 and SQL metadata', () => {
      const error = new DatabaseError('Table not found', {
        code: 'ER_NO_SUCH_TABLE',
        sql: 'SELECT * FROM nonexistent',
        errno: 1146
      });

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('ER_NO_SUCH_TABLE');
      expect(error.sql).toBe('SELECT * FROM nonexistent');
      expect(error.errno).toBe(1146);
    });
  });
});
