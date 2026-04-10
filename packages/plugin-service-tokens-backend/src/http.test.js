import test from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryServiceTokenDatabase } from './database.js';
import {
  handleCreateToken,
  handleGetAuditLog,
  handleGetScopes,
  handleListTokens,
  handleGetToken,
  handleRevokeToken,
} from './http.js';

test('handleCreateToken returns 201 with token and rawToken on success', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const db = createInMemoryServiceTokenDatabase({
    now: () => now,
    tokens: [],
  });

  const response = await handleCreateToken(
    {
      body: {
        name: 'cicd-pipeline',
        description: 'Used by CI to read the catalog during deploys.',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        expiresAt: '2026-05-01T00:00:00.000Z',
      },
      userEntityRef: 'user:default/alice',
    },
    {
      db,
      now: () => now,
      generateId: () => 'token-1',
      generateAuditId: () => 'audit-1',
      generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
    },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    token: {
      id: 'token-1',
      name: 'cicd-pipeline',
      description: 'Used by CI to read the catalog during deploys.',
      tokenPrefix: 'bsst_dGhpcyB',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      createdBy: 'user:default/alice',
      createdAt: '2026-04-04T12:00:00.000Z',
      expiresAt: '2026-05-01T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
      status: 'active',
    },
    rawToken: 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
  });
});

test('handleCreateToken maps validation errors to 422', async () => {
  const response = await handleCreateToken(
    {
      body: {
        name: 'cicd-pipeline',
        description: 'Used by CI',
        groupEntityRef: 'group:default/platform-team',
        scopes: [],
        expiresAt: '2026-05-01T00:00:00.000Z',
      },
      userEntityRef: 'user:default/alice',
    },
    {
      db: createInMemoryServiceTokenDatabase({ tokens: [] }),
      now: () => new Date('2026-04-04T12:00:00.000Z'),
      generateId: () => 'token-1',
      generateAuditId: () => 'audit-1',
      generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
    },
  );

  assert.equal(response.status, 422);
  assert.deepEqual(response.body, {
    error: 'At least one scope is required',
  });
});

test('handleCreateToken maps duplicate-name conflicts to 409', async () => {
  const db = createInMemoryServiceTokenDatabase({
    tokens: [
      {
        id: 'existing',
        tokenHash: 'hash-existing',
        tokenPrefix: 'bsst_existin',
        name: 'cicd-pipeline',
        description: 'Existing token',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        createdBy: 'user:default/alice',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
      },
    ],
  });

  const response = await handleCreateToken(
    {
      body: {
        name: 'cicd-pipeline',
        description: 'Used by CI',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        expiresAt: '2026-05-10T00:00:00.000Z',
      },
      userEntityRef: 'user:default/alice',
    },
    {
      db,
      now: () => new Date('2026-04-04T12:00:00.000Z'),
      generateId: () => 'token-1',
      generateAuditId: () => 'audit-1',
      generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    error: 'A token with this name already exists for the group',
  });
});

test('handleCreateToken maps configured max lifetime violations to 422', async () => {
  const response = await handleCreateToken(
    {
      body: {
        name: 'cicd-pipeline',
        description: 'Used by CI',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        expiresAt: '2027-05-10T00:00:00.000Z',
      },
      userEntityRef: 'user:default/alice',
    },
    {
      allowedScopes: ['catalog:read'],
      db: createInMemoryServiceTokenDatabase({ tokens: [] }),
      ensureGroupExists: async () => true,
      now: () => new Date('2026-04-04T12:00:00.000Z'),
      generateId: () => 'token-1',
      generateAuditId: () => 'audit-1',
      generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
      maxTokenLifetimeDays: 365,
    },
  );

  assert.equal(response.status, 422);
  assert.deepEqual(response.body, {
    error: 'expiresAt must not exceed the configured maximum of 365 days',
  });
});

test('handleRevokeToken returns 204 on success', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const db = createInMemoryServiceTokenDatabase({
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
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
      },
    ],
  });

  const response = await handleRevokeToken(
    {
      params: { id: 'token-1' },
      body: { reason: 'Rotated after team offboarding' },
      userEntityRef: 'user:default/bob',
    },
    {
      db,
      now: () => now,
      generateAuditId: () => 'audit-1',
    },
  );

  assert.equal(response.status, 204);
  assert.equal(response.body, undefined);
});

test('handleRevokeToken maps missing tokens to 404', async () => {
  const response = await handleRevokeToken(
    {
      params: { id: 'missing' },
      body: { reason: 'Rotated after team offboarding' },
      userEntityRef: 'user:default/bob',
    },
    {
      db: createInMemoryServiceTokenDatabase({ tokens: [] }),
      now: () => new Date('2026-04-04T12:00:00.000Z'),
      generateAuditId: () => 'audit-1',
    },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: 'Token not found',
  });
});

test('handleRevokeToken maps already revoked tokens to 409', async () => {
  const db = createInMemoryServiceTokenDatabase({
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
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: new Date('2026-04-03T00:00:00.000Z'),
        revokedBy: 'user:default/alice',
      },
    ],
  });

  const response = await handleRevokeToken(
    {
      params: { id: 'token-1' },
      body: { reason: 'Rotated after team offboarding' },
      userEntityRef: 'user:default/bob',
    },
    {
      db,
      now: () => new Date('2026-04-04T12:00:00.000Z'),
      generateAuditId: () => 'audit-1',
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    error: 'Token already revoked',
  });
});

test('handleGetAuditLog returns events for the requested token only', async () => {
  const db = createInMemoryServiceTokenDatabase({
    auditEvents: [
      {
        id: 'audit-1',
        tokenId: 'token-1',
        event: 'created',
        actor: 'user:default/alice',
        metadata: {},
        occurredAt: new Date('2026-04-04T12:00:00.000Z'),
      },
      {
        id: 'audit-2',
        tokenId: 'token-2',
        event: 'created',
        actor: 'user:default/bob',
        metadata: {},
        occurredAt: new Date('2026-04-04T12:01:00.000Z'),
      },
      {
        id: 'audit-3',
        tokenId: 'token-1',
        event: 'revoked',
        actor: 'user:default/charlie',
        metadata: { reason: 'Rotated after team offboarding' },
        occurredAt: new Date('2026-04-04T12:05:00.000Z'),
      },
    ],
  });

  const response = await handleGetAuditLog(
    {
      params: { id: 'token-1' },
    },
    {
      db,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    events: [
      {
        id: 'audit-3',
        tokenId: 'token-1',
        event: 'revoked',
        actor: 'user:default/charlie',
        metadata: { reason: 'Rotated after team offboarding' },
        occurredAt: '2026-04-04T12:05:00.000Z',
      },
      {
        id: 'audit-1',
        tokenId: 'token-1',
        event: 'created',
        actor: 'user:default/alice',
        metadata: {},
        occurredAt: '2026-04-04T12:00:00.000Z',
      },
    ],
  });
});

test('handleGetToken returns a single token by id', async () => {
  const db = createInMemoryServiceTokenDatabase({
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
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
      },
    ],
  });

  const response = await handleGetToken(
    {
      params: { id: 'token-1' },
    },
    {
      db,
      now: () => new Date('2026-04-04T12:00:00.000Z'),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    id: 'token-1',
    name: 'cicd-pipeline',
    description: 'Used by CI',
    tokenPrefix: 'bsst_dGhpcyB',
    groupEntityRef: 'group:default/platform-team',
    scopes: ['catalog:read'],
    createdBy: 'user:default/alice',
    createdAt: '2026-04-01T00:00:00.000Z',
    expiresAt: '2026-05-01T00:00:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
    revokedBy: null,
    status: 'expiring',
  });
});

test('handleGetToken maps missing token ids to 404', async () => {
  const response = await handleGetToken(
    {
      params: { id: 'missing' },
    },
    {
      db: createInMemoryServiceTokenDatabase({ tokens: [] }),
      now: () => new Date('2026-04-04T12:00:00.000Z'),
    },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: 'Token not found',
  });
});

test('handleListTokens returns default response shape with limit and offset defaults', async () => {
  const db = createInMemoryServiceTokenDatabase({
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
      {
        id: 'token-2',
        tokenHash: 'hash-2',
        tokenPrefix: 'bsst_Z2hpamts',
        name: 'deploy-bot',
        description: 'Used by deployments',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        createdBy: 'user:default/bob',
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        expiresAt: new Date('2026-04-20T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
      },
    ],
  });

  const response = await handleListTokens(
    {
      query: {},
    },
    {
      db,
      now: () => new Date('2026-04-04T12:00:00.000Z'),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    tokens: [
      {
        id: 'token-1',
        name: 'cicd-pipeline',
        description: 'Used by CI',
        tokenPrefix: 'bsst_dGhpcyB',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        createdBy: 'user:default/alice',
        createdAt: '2026-04-01T00:00:00.000Z',
        expiresAt: '2026-06-01T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
        status: 'active',
      },
      {
        id: 'token-2',
        name: 'deploy-bot',
        description: 'Used by deployments',
        tokenPrefix: 'bsst_Z2hpamts',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        createdBy: 'user:default/bob',
        createdAt: '2026-04-02T00:00:00.000Z',
        expiresAt: '2026-04-20T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
        status: 'expiring',
      },
    ],
    total: 2,
    limit: 50,
    offset: 0,
  });
});

test('handleListTokens passes through explicit limit and offset', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  const response = await handleListTokens(
    {
      query: {
        limit: '10',
        offset: '20',
      },
    },
    {
      db,
      now: () => new Date('2026-04-04T12:00:00.000Z'),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    tokens: [],
    total: 0,
    limit: 10,
    offset: 20,
  });
});

test('handleListTokens filters by status', async () => {
  const db = createInMemoryServiceTokenDatabase({
    tokens: [
      {
        id: 'active-token',
        tokenHash: 'hash-1',
        tokenPrefix: 'bsst_active1',
        name: 'active-bot',
        description: 'Active token',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        createdBy: 'user:default/alice',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        expiresAt: new Date('2026-06-10T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
      },
      {
        id: 'expiring-token',
        tokenHash: 'hash-2',
        tokenPrefix: 'bsst_expire2',
        name: 'expiring-bot',
        description: 'Expiring token',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        createdBy: 'user:default/alice',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        expiresAt: new Date('2026-04-20T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
      },
      {
        id: 'revoked-token',
        tokenHash: 'hash-3',
        tokenPrefix: 'bsst_revoke3',
        name: 'revoked-bot',
        description: 'Revoked token',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        createdBy: 'user:default/alice',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        expiresAt: new Date('2026-06-10T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: new Date('2026-04-02T00:00:00.000Z'),
        revokedBy: 'user:default/alice',
      },
    ],
  });

  const response = await handleListTokens(
    {
      query: {
        status: 'revoked',
      },
    },
    {
      db,
      now: () => new Date('2026-04-04T12:00:00.000Z'),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.tokens.length, 1);
  assert.equal(response.body.tokens[0].id, 'revoked-token');
  assert.equal(response.body.tokens[0].status, 'revoked');
});

test('handleListTokens filters by groupEntityRef', async () => {
  const db = createInMemoryServiceTokenDatabase({
    tokens: [
      {
        id: 'token-1',
        tokenHash: 'hash-1',
        tokenPrefix: 'bsst_group_1',
        name: 'platform-bot',
        description: 'Platform token',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        createdBy: 'user:default/alice',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        expiresAt: new Date('2026-06-10T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
      },
      {
        id: 'token-2',
        tokenHash: 'hash-2',
        tokenPrefix: 'bsst_group_2',
        name: 'payments-bot',
        description: 'Payments token',
        groupEntityRef: 'group:default/payments-team',
        scopes: ['catalog:read'],
        createdBy: 'user:default/bob',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        expiresAt: new Date('2026-06-10T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
      },
    ],
  });

  const response = await handleListTokens(
    {
      query: {
        groupEntityRef: 'group:default/payments-team',
      },
    },
    {
      db,
      now: () => new Date('2026-04-04T12:00:00.000Z'),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.tokens.length, 1);
  assert.equal(response.body.tokens[0].id, 'token-2');
  assert.equal(response.body.tokens[0].groupEntityRef, 'group:default/payments-team');
});

test('handleGetScopes returns the default scope catalogue', async () => {
  const response = await handleGetScopes({}, {});

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    scopes: [
      {
        id: 'catalog:read',
        description: 'Read access to the Software Catalog API',
        plugin: 'catalog',
      },
      {
        id: 'catalog:write',
        description: 'Write access to the Software Catalog API',
        plugin: 'catalog',
      },
      {
        id: 'techdocs:read',
        description: 'Read access to TechDocs',
        plugin: 'techdocs',
      },
      {
        id: 'scaffolder:read',
        description: 'Read access to Scaffolder templates and tasks',
        plugin: 'scaffolder',
      },
      {
        id: 'scaffolder:execute',
        description: 'Execute Scaffolder templates',
        plugin: 'scaffolder',
      },
    ],
  });
});

test('handleGetScopes returns a configured scope catalogue when provided', async () => {
  const response = await handleGetScopes(
    {},
    {
      scopeCatalogue: [
        {
          id: 'catalog:read',
          description: 'Read access to the Software Catalog API',
          plugin: 'catalog',
        },
        {
          id: 'custom:deploy',
          description: 'Deploy access for integration tests',
          plugin: 'deployments',
        },
      ],
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    scopes: [
      {
        id: 'catalog:read',
        description: 'Read access to the Software Catalog API',
        plugin: 'catalog',
      },
      {
        id: 'custom:deploy',
        description: 'Deploy access for integration tests',
        plugin: 'deployments',
      },
    ],
  });
});

test('handleCreateToken maps invalid group refs from the injected validator to 422', async () => {
  const response = await handleCreateToken(
    {
      body: {
        name: 'cicd-pipeline',
        description: 'Used by CI',
        groupEntityRef: 'group:default/missing-team',
        scopes: ['catalog:read'],
        expiresAt: '2026-05-01T00:00:00.000Z',
      },
      userEntityRef: 'user:default/alice',
    },
    {
      allowedScopes: ['catalog:read'],
      db: createInMemoryServiceTokenDatabase({ tokens: [] }),
      ensureGroupExists: async () => false,
      now: () => new Date('2026-04-04T12:00:00.000Z'),
      generateId: () => 'token-1',
      generateAuditId: () => 'audit-1',
      generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
    },
  );

  assert.equal(response.status, 422);
  assert.deepEqual(response.body, {
    error: 'groupEntityRef must reference an existing Group entity',
  });
});
