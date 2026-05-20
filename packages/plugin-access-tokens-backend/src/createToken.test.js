import test from 'node:test';
import assert from 'node:assert/strict';

import { createToken } from './createToken.js';
import { createInMemoryServiceTokenDatabase } from './database.js';

test('createToken persists a token and returns the token plus rawToken', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const db = createInMemoryServiceTokenDatabase({
    now: () => now,
    tokens: [],
  });

  const result = await createToken(
    {
      name: 'cicd-pipeline',
      description: 'Used by CI to read the catalog during deploys.',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      expiresAt: '2026-05-01T00:00:00.000Z',
    },
        {
          db,
          createdBy: 'user:default/alice',
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          now: () => now,
        },
  );

  assert.equal(result.rawToken, 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu');
  assert.deepEqual(result.token, {
    id: 'token-1',
    name: 'cicd-pipeline',
    description: 'Used by CI to read the catalog during deploys.',
    tokenPrefix: 'bsat_dGhpcyB',
    groupEntityRef: 'group:default/platform-team',
    scopes: ['catalog:read'],
    createdBy: 'user:default/alice',
    createdAt: '2026-04-04T12:00:00.000Z',
    expiresAt: '2026-05-01T00:00:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
    revokedBy: null,
    status: 'active',
  });

  const stored = db.__unsafeGetToken('token-1');
  assert.equal(
    stored.tokenHash,
    'addfe4e8dacfac0c9a1b3212c5a11263a22e2a86df288b73c40ae858d703acef',
  );
  assert.equal(stored.tokenPrefix, 'bsat_dGhpcyB');
});

test('createToken rejects empty scopes', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  await assert.rejects(
    () =>
      createToken(
        {
          name: 'cicd-pipeline',
          description: 'Used by CI',
          groupEntityRef: 'group:default/platform-team',
          scopes: [],
          expiresAt: '2026-05-01T00:00:00.000Z',
        },
        {
          db,
          createdBy: 'user:default/alice',
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          now: () => new Date('2026-04-04T12:00:00.000Z'),
        },
      ),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('createToken rejects invalid token names', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  await assert.rejects(
    () =>
      createToken(
        {
          name: 'CI/CD Pipeline',
          description: 'Used by CI',
          groupEntityRef: 'group:default/platform-team',
          scopes: ['catalog:read'],
          expiresAt: '2026-05-01T00:00:00.000Z',
        },
        {
          db,
          createdBy: 'user:default/alice',
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          now: () => new Date('2026-04-04T12:00:00.000Z'),
        },
      ),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('createToken rejects names longer than 100 characters', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  await assert.rejects(
    () =>
      createToken(
        {
          name: 'a'.repeat(101),
          description: 'Used by CI',
          groupEntityRef: 'group:default/platform-team',
          scopes: ['catalog:read'],
          expiresAt: '2026-05-01T00:00:00.000Z',
        },
        {
          db,
          createdBy: 'user:default/alice',
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          now: () => new Date('2026-04-04T12:00:00.000Z'),
        },
      ),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('createToken rejects descriptions longer than 500 characters', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  await assert.rejects(
    () =>
      createToken(
        {
          name: 'cicd-pipeline',
          description: 'x'.repeat(501),
          groupEntityRef: 'group:default/platform-team',
          scopes: ['catalog:read'],
          expiresAt: '2026-05-01T00:00:00.000Z',
        },
        {
          db,
          createdBy: 'user:default/alice',
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          now: () => new Date('2026-04-04T12:00:00.000Z'),
        },
      ),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('createToken rejects expiries in the past', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  await assert.rejects(
    () =>
      createToken(
        {
          name: 'cicd-pipeline',
          description: 'Used by CI',
          groupEntityRef: 'group:default/platform-team',
          scopes: ['catalog:read'],
          expiresAt: '2026-04-01T00:00:00.000Z',
        },
        {
          db,
          createdBy: 'user:default/alice',
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          now: () => new Date('2026-04-04T12:00:00.000Z'),
        },
      ),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('createToken rejects expiries beyond the configured maximum lifetime', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  await assert.rejects(
    () =>
      createToken(
        {
          name: 'cicd-pipeline',
          description: 'Used by CI',
          groupEntityRef: 'group:default/platform-team',
          scopes: ['catalog:read'],
          expiresAt: '2027-05-10T00:00:00.000Z',
        },
        {
          allowedScopes: ['catalog:read'],
          db,
          createdBy: 'user:default/alice',
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          maxTokenLifetimeDays: 365,
          now: () => new Date('2026-04-04T12:00:00.000Z'),
        },
      ),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('createToken rejects duplicate names within the same group', async () => {
  const db = createInMemoryServiceTokenDatabase({
    now: () => new Date('2026-04-04T12:00:00.000Z'),
    tokens: [
      {
        id: 'existing',
        tokenHash: 'hash-existing',
        tokenPrefix: 'bsat_existin',
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

  await assert.rejects(
    () =>
      createToken(
        {
          name: 'cicd-pipeline',
          description: 'Used by CI',
          groupEntityRef: 'group:default/platform-team',
          scopes: ['catalog:read'],
          expiresAt: '2026-05-10T00:00:00.000Z',
        },
        {
          db,
          createdBy: 'user:default/alice',
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          now: () => new Date('2026-04-04T12:00:00.000Z'),
        },
      ),
    error => error.code === 'CONFLICT',
  );
});

test('createToken rejects scopes that are not in the allowed catalogue', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  await assert.rejects(
    () =>
      createToken(
        {
          name: 'cicd-pipeline',
          description: 'Used by CI',
          groupEntityRef: 'group:default/platform-team',
          scopes: ['unknown:scope'],
          expiresAt: '2026-05-01T00:00:00.000Z',
        },
        {
          allowedScopes: ['catalog:read', 'catalog:write'],
          db,
          createdBy: 'user:default/alice',
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          now: () => new Date('2026-04-04T12:00:00.000Z'),
        },
      ),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('createToken rejects group refs that fail existence validation', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  await assert.rejects(
    () =>
      createToken(
        {
          name: 'cicd-pipeline',
          description: 'Used by CI',
          groupEntityRef: 'group:default/missing-team',
          scopes: ['catalog:read'],
          expiresAt: '2026-05-01T00:00:00.000Z',
        },
        {
          allowedScopes: ['catalog:read'],
          db,
          createdBy: 'user:default/alice',
          ensureGroupExists: async groupEntityRef => {
            assert.equal(groupEntityRef, 'group:default/missing-team');
            return false;
          },
          generateId: () => 'token-1',
          generateAuditId: () => 'audit-1',
          generateRawToken: () => 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
          now: () => new Date('2026-04-04T12:00:00.000Z'),
        },
      ),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('createToken accepts group refs that pass existence validation', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const db = createInMemoryServiceTokenDatabase({
    now: () => now,
    tokens: [],
  });

  const result = await createToken(
    {
      name: 'deploy-bot',
      description: 'Used by CD',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      expiresAt: '2026-05-01T00:00:00.000Z',
    },
    {
      allowedScopes: ['catalog:read'],
      db,
      createdBy: 'user:default/alice',
      ensureGroupExists: async groupEntityRef => {
        assert.equal(groupEntityRef, 'group:default/platform-team');
        return true;
      },
      generateId: () => 'token-2',
      generateAuditId: () => 'audit-2',
      generateRawToken: () => 'bsat_Zm9yLXRlc3Qtb25seS10b2tlbg',
      now: () => now,
    },
  );

  assert.equal(result.token.id, 'token-2');
  assert.equal(result.token.groupEntityRef, 'group:default/platform-team');
  assert.deepEqual(result.token.scopes, ['catalog:read']);
});

test('createToken uses the configured default lifetime when expiresAt is omitted', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const db = createInMemoryServiceTokenDatabase({
    now: () => now,
    tokens: [],
  });

  const result = await createToken(
    {
      name: 'default-expiry-token',
      description: 'Used by CI',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
    },
    {
      allowedScopes: ['catalog:read'],
      db,
      createdBy: 'user:default/alice',
      ensureGroupExists: async () => true,
      generateId: () => 'token-3',
      generateAuditId: () => 'audit-3',
      generateRawToken: () => 'bsat_ZGVmYXVsdC1leHBpcnk',
      defaultTokenLifetimeDays: 30,
      maxTokenLifetimeDays: 365,
      now: () => now,
    },
  );

  assert.equal(result.token.expiresAt, '2026-05-04T12:00:00.000Z');
});
