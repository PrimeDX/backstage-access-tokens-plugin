import test from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryServiceTokenDatabase } from './database.js';
import { createAuthorizedHttpApi } from './auth.js';

test('authorized API returns 401 when the request has no user identity', async () => {
  const api = createAuthorizedHttpApi({
    db: createInMemoryServiceTokenDatabase({ tokens: [] }),
    getUserEntityRef: async () => null,
    isAdmin: async () => false,
  });

  const response = await api.handle({
    method: 'GET',
    path: '/api/service-tokens',
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    error: 'Unauthorized',
  });
});

test('authorized API returns 403 for authenticated non-admin users', async () => {
  const api = createAuthorizedHttpApi({
    db: createInMemoryServiceTokenDatabase({ tokens: [] }),
    getUserEntityRef: async () => 'user:default/alice',
    isAdmin: async () => false,
  });

  const response = await api.handle({
    method: 'GET',
    path: '/api/service-tokens',
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: 'Forbidden: admin access required',
  });
});

test('authorized API allows admin users through to the routed handlers', async () => {
  const api = createAuthorizedHttpApi({
    db: createInMemoryServiceTokenDatabase({ tokens: [] }),
    now: () => new Date('2026-04-04T12:00:00.000Z'),
    getUserEntityRef: async () => 'user:default/alice',
    isAdmin: async () => true,
  });

  const response = await api.handle({
    method: 'GET',
    path: '/api/service-tokens',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    tokens: [],
    total: 0,
    limit: 50,
    offset: 0,
  });
});
