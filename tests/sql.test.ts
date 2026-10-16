import { describe, it, expect } from 'vitest';
import {
  escapeIdentifier,
  buildSelectQuery,
  buildCountQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  parseQueryParams
} from '../src/core/sql';
import { ValidationError } from '../src/errors';

describe('SQL Pure Builders', () => {
  describe('escapeIdentifier', () => {
    it('should correctly escape simple alphanumeric identifiers', () => {
      expect(escapeIdentifier('users')).toBe('`users`');
      expect(escapeIdentifier('created_at')).toBe('`created_at`');
      expect(escapeIdentifier('col123')).toBe('`col123`');
    });

    it('should correctly escape table.column compound identifiers', () => {
      expect(escapeIdentifier('accounts.iduser')).toBe('`accounts`.`iduser`');
    });

    it('should reject malicious injection strings with ValidationError', () => {
      expect(() => escapeIdentifier('users; DROP TABLE accounts;--')).toThrow(ValidationError);
      expect(() => escapeIdentifier('user name')).toThrow(ValidationError);
      expect(() => escapeIdentifier('id = 1 OR 1=1')).toThrow(ValidationError);
      expect(() => escapeIdentifier('table`name')).toThrow(ValidationError);
    });
  });

  describe('buildSelectQuery', () => {
    it('should build a basic SELECT * query', () => {
      const { sql, params } = buildSelectQuery({ table: 'account' });
      expect(sql).toBe('SELECT * FROM `account`');
      expect(params).toEqual([]);
    });

    it('should build a projected query with specific fields', () => {
      const { sql, params } = buildSelectQuery({
        table: 'account',
        fields: ['iduser', 'email', 'first_name']
      });
      expect(sql).toBe('SELECT `iduser`, `email`, `first_name` FROM `account`');
      expect(params).toEqual([]);
    });

    it('should build query with WHERE object filters and pagination', () => {
      const { sql, params } = buildSelectQuery({
        table: 'account',
        where: { role: 'admin', status: 'active' },
        limit: 10,
        offset: 20
      });
      expect(sql).toBe(
        'SELECT * FROM `account` WHERE `role` = ? AND `status` = ? LIMIT ? OFFSET ?'
      );
      expect(params).toEqual(['admin', 'active', 10, 20]);
    });

    it('should build query with structured condition operators including IN and IS NULL', () => {
      const { sql, params } = buildSelectQuery({
        table: 'account',
        where: [
          { column: 'status', operator: 'IN', value: ['pending', 'active'] },
          { column: 'deleted_at', operator: 'IS NULL' }
        ]
      });
      expect(sql).toBe('SELECT * FROM `account` WHERE `status` IN (?, ?) AND `deleted_at` IS NULL');
      expect(params).toEqual(['pending', 'active']);
    });

    it('should build query with search term across multiple columns', () => {
      const { sql, params } = buildSelectQuery({
        table: 'account',
        search: {
          fields: ['email', 'first_name', 'last_name'],
          term: 'alex'
        }
      });
      expect(sql).toBe(
        'SELECT * FROM `account` WHERE (`email` LIKE ? OR `first_name` LIKE ? OR `last_name` LIKE ?)'
      );
      expect(params).toEqual(['%alex%', '%alex%', '%alex%']);
    });

    it('should build query with ORDER BY clauses', () => {
      const { sql, params } = buildSelectQuery({
        table: 'account',
        orderBy: [
          { column: 'role', direction: 'ASC' },
          { column: 'created_at', direction: 'DESC' }
        ]
      });
      expect(sql).toBe('SELECT * FROM `account` ORDER BY `role` ASC, `created_at` DESC');
      expect(params).toEqual([]);
    });
  });

  describe('buildCountQuery', () => {
    it('should build a matching COUNT query with WHERE filters', () => {
      const { sql, params } = buildCountQuery({
        table: 'account',
        where: { role: 'user' }
      });
      expect(sql).toBe('SELECT COUNT(*) AS total FROM `account` WHERE `role` = ?');
      expect(params).toEqual(['user']);
    });
  });

  describe('buildInsertQuery', () => {
    it('should build a single row insert query with parameterized values', () => {
      const { sql, params } = buildInsertQuery('account', [
        { email: 'test@example.com', role: 'user' }
      ]);
      expect(sql).toBe('INSERT INTO `account` (`email`, `role`) VALUES (?, ?)');
      expect(params).toEqual(['test@example.com', 'user']);
    });

    it('should build a batch multi-row insert query', () => {
      const { sql, params } = buildInsertQuery('account', [
        { email: 'user1@example.com', role: 'user' },
        { email: 'user2@example.com', role: 'admin' }
      ]);
      expect(sql).toBe('INSERT INTO `account` (`email`, `role`) VALUES (?, ?), (?, ?)');
      expect(params).toEqual(['user1@example.com', 'user', 'user2@example.com', 'admin']);
    });
  });

  describe('buildUpdateQuery', () => {
    it('should build an update query with safe column escaping and parameter binding', () => {
      const { sql, params } = buildUpdateQuery(
        'account',
        { first_name: 'John', status: 'verified' },
        '`iduser` = ?',
        [42]
      );
      expect(sql).toBe('UPDATE `account` SET `first_name` = ?, `status` = ? WHERE `iduser` = ?');
      expect(params).toEqual(['John', 'verified', 42]);
    });
  });

  describe('buildDeleteQuery', () => {
    it('should build a parameterized delete query', () => {
      const { sql, params } = buildDeleteQuery('account', '`iduser` = ?', [10]);
      expect(sql).toBe('DELETE FROM `account` WHERE `iduser` = ?');
      expect(params).toEqual([10]);
    });
  });

  describe('parseQueryParams', () => {
    it('should parse pagination with default limits and calculate offset', () => {
      const parsed = parseQueryParams({ page: '2', limit: '15' });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(15);
      expect(parsed.offset).toBe(15);
    });

    it('should clamp limit to maxLimit', () => {
      const parsed = parseQueryParams({ limit: '500' }, { maxLimit: 50 });
      expect(parsed.limit).toBe(50);
    });

    it('should parse projection fields and filter by allowed whitelist', () => {
      const parsed = parseQueryParams(
        { fields: 'iduser, email, password_hash, unapproved' },
        { allowedFields: ['iduser', 'email', 'first_name'] }
      );
      expect(parsed.fields).toEqual(['iduser', 'email']);
    });

    it('should parse sort clauses with prefix and direction syntax', () => {
      const parsed = parseQueryParams(
        { sort: 'created_at:desc,-role,first_name:asc' },
        { allowedFields: ['created_at', 'role', 'first_name'] }
      );
      expect(parsed.orderBy).toEqual([
        { column: 'created_at', direction: 'DESC' },
        { column: 'role', direction: 'DESC' },
        { column: 'first_name', direction: 'ASC' }
      ]);
    });

    it('should parse search parameter and map to searchable fields', () => {
      const parsed = parseQueryParams(
        { search: 'developer' },
        { searchableFields: ['email', 'title'] }
      );
      expect(parsed.search).toEqual({
        fields: ['email', 'title'],
        term: 'developer'
      });
    });

    it('should extract column equality filters while ignoring reserved pagination keys', () => {
      const parsed = parseQueryParams(
        { page: '1', limit: '20', sort: 'id:asc', role: 'admin', status: 'active' },
        { allowedFields: ['id', 'role', 'status'] }
      );
      expect(parsed.filters).toEqual({
        role: 'admin',
        status: 'active'
      });
    });
  });
});
