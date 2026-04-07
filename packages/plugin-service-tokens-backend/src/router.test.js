import test from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryServiceTokenDatabase } from './database.js';
import { createHttpApi } from './router.js';

test('router dispatches POST /api/service-tokens', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const api = createHttpApi({
    db: createInMemoryServiceTokenDatabase({ now: () => now, tokens: [] }),
    now: () => now,
    generateId: () => 'token-1',
    generateAuditId: () => 'audit-1',
    generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
  });

  const response = await api.handle({
    method: 'POST',
    path: '/api/service-tokens',
    body: {
      name: 'cicd-pipeline',
      description: 'Used by CI to read the catalog during deploys.',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      expiresAt: '2026-05-01T00:00:00.000Z',
    },
    userEntityRef: 'user:default/alice',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.token.id, 'token-1');
});

test('router dispatches GET /api/service-tokens with query', async () => {
  const api = createHttpApi({
    db: createInMemoryServiceTokenDatabase({ tokens: [] }),
    now: () => new Date('2026-04-04T12:00:00.000Z'),
  });

  const response = await api.handle({
    method: 'GET',
    path: '/api/service-tokens',
    query: { limit: '10', offset: '5' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.limit, 10);
  assert.equal(response.body.offset, 5);
});

test('router dispatches GET /api/service-tokens/:id', async () => {
  const api = createHttpApi({
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
  });

  const response = await api.handle({
    method: 'GET',
    path: '/api/service-tokens/token-1',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.id, 'token-1');
});

test('router dispatches DELETE /api/service-tokens/:id', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const api = createHttpApi({
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
  });

  const response = await api.handle({
    method: 'DELETE',
    path: '/api/service-tokens/token-1',
    body: { reason: 'Rotated after team offboarding' },
    userEntityRef: 'user:default/bob',
  });

  assert.equal(response.status, 204);
});

test('router dispatches GET /api/service-tokens/:id/audit', async () => {
  const api = createHttpApi({
    db: createInMemoryServiceTokenDatabase({
      auditEvents: [
        {
          id: 'audit-1',
          tokenId: 'token-1',
          event: 'created',
          actor: 'user:default/alice',
          metadata: {},
          occurredAt: new Date('2026-04-04T12:00:00.000Z'),
        },
      ],
    }),
  });

  const response = await api.handle({
    method: 'GET',
    path: '/api/service-tokens/token-1/audit',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.events.length, 1);
});

test('router dispatches GET /api/service-tokens/scopes', async () => {
  const api = createHttpApi({
    db: createInMemoryServiceTokenDatabase({ tokens: [] }),
  });

  const response = await api.handle({
    method: 'GET',
    path: '/api/service-tokens/scopes',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.scopes.length, 5);
});

test('router returns 404 for unknown routes', async () => {
  const api = createHttpApi({
    db: createInMemoryServiceTokenDatabase({ tokens: [] }),
  });

  const response = await api.handle({
    method: 'GET',
    path: '/api/unknown',
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: 'Not found',
  });
});
