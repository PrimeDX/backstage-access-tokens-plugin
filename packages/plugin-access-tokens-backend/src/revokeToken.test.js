import test from 'node:test';
import assert from 'node:assert/strict';

import { revokeToken } from './revokeToken.js';
import { createInMemoryServiceTokenDatabase } from './database.js';

test('revokeToken marks a token as revoked and keeps the row', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const db = createInMemoryServiceTokenDatabase({
    now: () => now,
    tokens: [
      {
        id: 'token-1',
        tokenHash: 'hash-1',
        tokenPrefix: 'bsat_dGhpcyB',
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

  await revokeToken('token-1', {
    db,
    revokedBy: 'user:default/bob',
    reason: 'Rotated after team offboarding',
    now: () => now,
    generateAuditId: () => 'audit-1',
  });

  const stored = db.__unsafeGetToken('token-1');
  assert.equal(stored.revokedAt?.toISOString(), '2026-04-04T12:00:00.000Z');
  assert.equal(stored.revokedBy, 'user:default/bob');
});

test('revokeToken rejects missing token ids', async () => {
  const db = createInMemoryServiceTokenDatabase({ tokens: [] });

  await assert.rejects(
    () =>
      revokeToken('missing', {
        db,
        revokedBy: 'user:default/bob',
        reason: 'Rotated after team offboarding',
        now: () => new Date('2026-04-04T12:00:00.000Z'),
        generateAuditId: () => 'audit-1',
      }),
    error => error.code === 'NOT_FOUND',
  );
});

test('revokeToken rejects already revoked tokens', async () => {
  const db = createInMemoryServiceTokenDatabase({
    tokens: [
      {
        id: 'token-1',
        tokenHash: 'hash-1',
        tokenPrefix: 'bsat_dGhpcyB',
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

  await assert.rejects(
    () =>
      revokeToken('token-1', {
        db,
        revokedBy: 'user:default/bob',
        reason: 'Rotated after team offboarding',
        now: () => new Date('2026-04-04T12:00:00.000Z'),
        generateAuditId: () => 'audit-1',
      }),
    error => error.code === 'CONFLICT',
  );
});

test('revokeToken rejects empty reasons', async () => {
  const db = createInMemoryServiceTokenDatabase({
    tokens: [
      {
        id: 'token-1',
        tokenHash: 'hash-1',
        tokenPrefix: 'bsat_dGhpcyB',
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

  await assert.rejects(
    () =>
      revokeToken('token-1', {
        db,
        revokedBy: 'user:default/bob',
        reason: '   ',
        now: () => new Date('2026-04-04T12:00:00.000Z'),
        generateAuditId: () => 'audit-1',
      }),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('revokeToken rejects reasons longer than 500 characters', async () => {
  const db = createInMemoryServiceTokenDatabase({
    tokens: [
      {
        id: 'token-1',
        tokenHash: 'hash-1',
        tokenPrefix: 'bsat_dGhpcyB',
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

  await assert.rejects(
    () =>
      revokeToken('token-1', {
        db,
        revokedBy: 'user:default/bob',
        reason: 'x'.repeat(501),
        now: () => new Date('2026-04-04T12:00:00.000Z'),
        generateAuditId: () => 'audit-1',
      }),
    error => error.code === 'VALIDATION_ERROR',
  );
});
