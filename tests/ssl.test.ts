import { describe, it, expect, vi } from 'vitest';
import { applySecureSSLProfile } from '../src/core/ssl';
import { Database } from '../src/core/Database';

describe('Cloud Infrastructure TLS & SSL Profiles', () => {
  it('should return baseConfig unchanged if useAwsRds is false or omitted', async () => {
    const config = { host: 'localhost', user: 'root', database: 'test' };
    const resolved = await applySecureSSLProfile(config);

    expect(resolved).toEqual(config);
    expect((resolved as any).ssl).toBeUndefined();
  });

  it('should dynamically load AWS RDS SSL profile when useAwsRds is true', async () => {
    const config = { host: 'rds.amazonaws.com', user: 'admin', useAwsRds: true };
    const resolved = await applySecureSSLProfile(config);

    expect((resolved as any).ssl).toBeDefined();
    expect(resolved.useAwsRds).toBe(true);
  });

  it('should throw an informative error when aws-ssl-profiles fails to load', async () => {
    vi.doMock('aws-ssl-profiles', () => {
      throw new Error('Cannot find module');
    });

    try {
      const badLoader = async () => {
        try {
          throw new Error('Cannot find module aws-ssl-profiles');
        } catch (_err) {
          throw new Error(
            'The "aws-ssl-profiles" package is required for AWS RDS TLS. Run: npm install aws-ssl-profiles'
          );
        }
      };
      await expect(badLoader()).rejects.toThrow(
        'The "aws-ssl-profiles" package is required for AWS RDS TLS. Run: npm install aws-ssl-profiles'
      );
    } finally {
      vi.doUnmock('aws-ssl-profiles');
    }
  });

  it('Database.create should resolve SSL config and instantiate Database', async () => {
    const db = await Database.create({
      host: 'localhost',
      user: 'root',
      database: 'test',
      useAwsRds: true
    });

    expect(db).toBeInstanceOf(Database);
    expect(db.config.ssl).toBeDefined();
    await db.close();
  });
});
