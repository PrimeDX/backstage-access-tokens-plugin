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
    error: 'Forbidden: access denied',
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

test('authorized API uses granular read permission for GET requests', async () => {
  const calls = [];
  const api = createAuthorizedHttpApi({
    db: createInMemoryServiceTokenDatabase({ tokens: [] }),
    now: () => new Date('2026-04-04T12:00:00.000Z'),
    getUserEntityRef: async () => 'user:default/alice',
    isReadAllowed: async (userEntityRef) => {
      calls.push({ check: 'read', userEntityRef });
      return true;
    },
    isWriteAllowed: async () => false,
    isRevokeAllowed: async () => false,
  });

  const response = await api.handle({
    method: 'GET',
    path: '/api/service-tokens',
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].check, 'read');
});

test('authorized API uses granular write permission for POST requests', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const calls = [];
  const api = createAuthorizedHttpApi({
    db: createInMemoryServiceTokenDatabase({ tokens: [], now: () => now }),
    now: () => now,
    generateId: () => 'token-1',
    generateAuditId: () => 'audit-1',
    generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
    getUserEntityRef: async () => 'user:default/alice',
    isReadAllowed: async () => false,
    isWriteAllowed: async (userEntityRef) => {
      calls.push({ check: 'write', userEntityRef });
      return true;
    },
    isRevokeAllowed: async () => false,
  });

  const response = await api.handle({
    method: 'POST',
    path: '/api/service-tokens',
    body: {
      name: 'test-token',
      description: 'Test',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      expiresAt: '2026-05-01T00:00:00.000Z',
    },
    userEntityRef: 'user:default/alice',
  });

  assert.equal(response.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].check, 'write');
});

test('authorized API uses granular revoke permission for DELETE requests', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const calls = [];
  const api = createAuthorizedHttpApi({
    db: createInMemoryServiceTokenDatabase({
      now: () => now,
      tokens: [
        {
          id: 'token-1',
          tokenHash: 'hash-1',
          tokenPrefix: 'bsst_dGhpcyB',
          name: 'cicd-pipeline',
          description: 'Used by CI',
          groupEntityRef: 'group:default/platform-team',
          scopes: ['catalog:read'],
          createdBy: 'user:default/alice',
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          expiresAt: new Date('2026-06-01T00:00:00.000Z'),
          lastUsedAt: null,
          revokedAt: null,
          revokedBy: null,
        },
      ],
    }),
    now: () => now,
    generateAuditId: () => 'audit-1',
    getUserEntityRef: async () => 'user:default/alice',
    isReadAllowed: async () => false,
    isWriteAllowed: async () => false,
    isRevokeAllowed: async (userEntityRef) => {
      calls.push({ check: 'revoke', userEntityRef });
      return true;
    },
  });

  const response = await api.handle({
    method: 'DELETE',
    path: '/api/service-tokens/token-1',
    body: { reason: 'rotation' },
    userEntityRef: 'user:default/alice',
  });

  assert.equal(response.status, 204);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].check, 'revoke');
});

test('authorized API denies write when only read is allowed', async () => {
  const api = createAuthorizedHttpApi({
    db: createInMemoryServiceTokenDatabase({ tokens: [] }),
    getUserEntityRef: async () => 'user:default/auditor',
    isReadAllowed: async () => true,
    isWriteAllowed: async () => false,
    isRevokeAllowed: async () => false,
  });

  const response = await api.handle({
    method: 'POST',
    path: '/api/service-tokens',
    body: {
      name: 'should-fail',
      description: 'Test',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      expiresAt: '2026-05-01T00:00:00.000Z',
    },
    userEntityRef: 'user:default/auditor',
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: 'Forbidden: access denied',
  });
});

test('authorized API denies revoke when only read is allowed', async () => {
  const api = createAuthorizedHttpApi({
    db: createInMemoryServiceTokenDatabase({
      tokens: [
        {
          id: 'token-1',
          tokenHash: 'hash-1',
          tokenPrefix: 'bsst_dGhpcyB',
          name: 'cicd-pipeline',
          description: 'Used by CI',
          groupEntityRef: 'group:default/platform-team',
          scopes: ['catalog:read'],
          createdBy: 'user:default/alice',
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          expiresAt: new Date('2026-06-01T00:00:00.000Z'),
          lastUsedAt: null,
          revokedAt: null,
          revokedBy: null,
        },
      ],
    }),
    now: () => new Date('2026-04-04T12:00:00.000Z'),
    generateAuditId: () => 'audit-1',
    getUserEntityRef: async () => 'user:default/auditor',
    isReadAllowed: async () => true,
    isWriteAllowed: async () => false,
    isRevokeAllowed: async () => false,
  });

  const response = await api.handle({
    method: 'DELETE',
    path: '/api/service-tokens/token-1',
    body: { reason: 'rotation' },
    userEntityRef: 'user:default/auditor',
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: 'Forbidden: access denied',
  });
});
