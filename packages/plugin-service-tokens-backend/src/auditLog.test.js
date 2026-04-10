import test from 'node:test';
import assert from 'node:assert/strict';

import { createToken } from './createToken.js';
import { createInMemoryServiceTokenDatabase } from './database.js';
import { revokeToken } from './revokeToken.js';

test('createToken writes a created audit event', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const db = createInMemoryServiceTokenDatabase({
    now: () => now,
    tokens: [],
  });

  await createToken(
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
      generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
      now: () => now,
      generateAuditId: () => 'audit-1',
    },
  );

  const events = await db.getAuditLog('token-1');

  assert.deepEqual(events, [
    {
      id: 'audit-1',
      tokenId: 'token-1',
      event: 'created',
      actor: 'user:default/alice',
      metadata: {},
      occurredAt: '2026-04-04T12:00:00.000Z',
    },
  ]);
});

test('revokeToken writes a revoked audit event with the reason', async () => {
  const timestamps = [
    new Date('2026-04-04T12:00:00.000Z'),
    new Date('2026-04-04T12:05:00.000Z'),
  ];
  let index = 0;
  const db = createInMemoryServiceTokenDatabase({
    now: () => timestamps[index],
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
        createdAt: timestamps[0],
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
      },
    ],
    auditEvents: [
      {
        id: 'audit-1',
        tokenId: 'token-1',
        event: 'created',
        actor: 'user:default/alice',
        metadata: {},
        occurredAt: timestamps[0],
      },
    ],
  });

  index = 1;
  await revokeToken('token-1', {
    db,
    revokedBy: 'user:default/bob',
    reason: 'Rotated after team offboarding',
    now: () => timestamps[index],
    generateAuditId: () => 'audit-2',
  });

  const events = await db.getAuditLog('token-1');

  assert.deepEqual(events, [
    {
      id: 'audit-2',
      tokenId: 'token-1',
      event: 'revoked',
      actor: 'user:default/bob',
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
  ]);
});
