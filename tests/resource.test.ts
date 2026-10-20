import { describe, it, expect, vi } from 'vitest';
import { BaseClient } from '../src/core/BaseClient';
import { createResourceRouter } from '../src/core/ResourceEngine';
import { InstrumentationManager } from '../src/core/Instrumentation';

class MockClient extends BaseClient {
  public mockData: any[] = [
    { id: 1, email: 'alex@example.com', name: 'Alex', password_hash: '$2b$12$secret1' },
    { id: 2, email: 'beth@example.com', name: 'Beth', password_hash: '$2b$12$secret2' }
  ];

  constructor() {
    super(new InstrumentationManager());
  }

  protected getExecutor(): any {
    return {};
  }

  public override async paginate<T = any>(_table: string, queryParams: any): Promise<any> {
    let filtered = [...this.mockData];
    if (queryParams.filters?.name) {
      filtered = filtered.filter((i) => i.name === queryParams.filters.name);
    }
    return {
      data: filtered as T[],
      meta: {
        total: filtered.length,
        page: queryParams.page,
        limit: queryParams.limit,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      }
    };
  }

  public override async queryOne<T = any>(_sql: string, params: any[] = []): Promise<T | null> {
    const id = Number(params[0]);
    const found = this.mockData.find((item) => item.id === id);
    return (found as T) ?? null;
  }

  public override async insert<TRecord extends Record<string, any>>(
    _table: string,
    records: TRecord | TRecord[]
  ): Promise<any> {
    const item = Array.isArray(records) ? records[0] : records;
    const newId = this.mockData.length + 1;
    const created = { id: newId, ...item };
    this.mockData.push(created);
    return { insertId: newId, affectedRows: 1 };
  }

  public override async update<TData extends Record<string, any>>(
    _table: string,
    data: TData,
    _where: string,
    params: any[] = []
  ): Promise<any> {
    const id = Number(params[0]);
    const idx = this.mockData.findIndex((i) => i.id === id);
    if (idx !== -1 && this.mockData[idx]) {
      this.mockData[idx] = { ...this.mockData[idx], ...data };
      return { affectedRows: 1, changedRows: 1 };
    }
    return { affectedRows: 0, changedRows: 0 };
  }

  public override async delete(_table: string, _where: string, params: any[] = []): Promise<any> {
    const id = Number(params[0]);
    this.mockData = this.mockData.filter((i) => i.id !== id);
    return { affectedRows: 1 };
  }
}

// Helper to simulate calling router endpoints
function createMockReqRes(options: {
  method: string;
  url: string;
  params?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
}) {
  const req: any = {
    method: options.method,
    url: options.url,
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body ?? {},
    headers: {}
  };

  const res: any = {
    statusCode: 200,
    headers: {},
    _data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this._data = data;
      return this;
    }
  };

  const next = vi.fn();
  return { req, res, next };
}

describe('Instant CRUD Resource Engine', () => {
  it('should generate a router and list resources while stripping hidden fields', async () => {
    const client = new MockClient();
    const router = createResourceRouter(client, 'account', {
      primaryKey: 'id',
      allowedFields: ['id', 'email', 'name'],
      hiddenFields: ['password_hash']
    });

    const { req, res, next } = createMockReqRes({
      method: 'GET',
      url: '/',
      query: { page: '1', limit: '10' }
    });

    // Execute route handler matching GET /
    const routeLayer: any = router.stack.find((layer: any) => layer.route?.path === '/' && layer.route?.methods?.get);
    expect(routeLayer).toBeDefined();

    await routeLayer.route.stack[0].handle(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res._data.success).toBe(true);
    expect(res._data.data.length).toBe(2);
    // Ensure hidden fields are stripped
    expect(res._data.data[0].password_hash).toBeUndefined();
    expect(res._data.data[0].email).toBe('alex@example.com');
  });

  it('should fetch a single resource by ID and strip hidden fields', async () => {
    const client = new MockClient();
    const router = createResourceRouter(client, 'account', {
      primaryKey: 'id',
      hiddenFields: ['password_hash']
    });

    const { req, res, next } = createMockReqRes({
      method: 'GET',
      url: '/1',
      params: { id: '1' }
    });

    const routeLayer: any = router.stack.find(
      (layer: any) => layer.route?.path === '/:id' && layer.route?.methods?.get
    );
    expect(routeLayer).toBeDefined();

    await routeLayer.route.stack[0].handle(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res._data.success).toBe(true);
    expect(res._data.data.id).toBe(1);
    expect(res._data.data.name).toBe('Alex');
    expect(res._data.data.password_hash).toBeUndefined();
  });

  it('should return 404 when single resource is not found', async () => {
    const client = new MockClient();
    const router = createResourceRouter(client, 'account', { primaryKey: 'id' });

    const { req, res, next } = createMockReqRes({
      method: 'GET',
      url: '/999',
      params: { id: '999' }
    });

    const routeLayer: any = router.stack.find(
      (layer: any) => layer.route?.path === '/:id' && layer.route?.methods?.get
    );
    await routeLayer.route.stack[0].handle(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res._data.success).toBe(false);
  });

  it('should strip read-only fields on create (POST /)', async () => {
    const client = new MockClient();
    const router = createResourceRouter(client, 'account', {
      primaryKey: 'id',
      readOnlyFields: ['id', 'created_at']
    });

    const { req, res, next } = createMockReqRes({
      method: 'POST',
      url: '/',
      body: {
        id: 99999, // Attempted ID injection (should be stripped)
        email: 'charlie@example.com',
        name: 'Charlie'
      }
    });

    const routeLayer: any = router.stack.find(
      (layer: any) => layer.route?.path === '/' && layer.route?.methods?.post
    );
    await routeLayer.route.stack[0].handle(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(res._data.success).toBe(true);
    expect(res._data.data.email).toBe('charlie@example.com');
    // Newly generated ID should be 3, not the forged 99999
    expect(res._data.data.id).toBe(3);
  });

  it('should support beforeCreate and afterCreate lifecycle hooks', async () => {
    const client = new MockClient();
    const beforeHook = vi.fn((data) => ({ ...data, name: data.name.toUpperCase() }));
    const afterHook = vi.fn();

    const router = createResourceRouter(client, 'account', {
      hooks: {
        beforeCreate: beforeHook,
        afterCreate: afterHook
      }
    });

    const { req, res, next } = createMockReqRes({
      method: 'POST',
      url: '/',
      body: { email: 'dan@example.com', name: 'Dan' }
    });

    const routeLayer: any = router.stack.find(
      (layer: any) => layer.route?.path === '/' && layer.route?.methods?.post
    );
    await routeLayer.route.stack[0].handle(req, res, next);

    expect(beforeHook).toHaveBeenCalledTimes(1);
    expect(afterHook).toHaveBeenCalledTimes(1);
    expect(res._data.data.name).toBe('DAN');
  });
});
