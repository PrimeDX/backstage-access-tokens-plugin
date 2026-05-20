import test from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryServiceTokenDatabase } from './database.js';

test('findActiveToken returns an active matching token', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const db = createInMemoryServiceTokenDatabase({
    now: () => now,
    tokens: [
      {
        id: 'token-1',
        tokenHash: 'hash-1',
        groupEntityRef: 'group:default/platform-team',
        name: 'cicd-pipeline',
        scopes: ['catalog:read'],
        expiresAt: new Date('2026-04-10T00:00:00.000Z'),
        revokedAt: null,
        lastUsedAt: null,
      },
    ],
  });

  const result = await db.findActiveToken('hash-1');

  assert.deepEqual(result, {
    id: 'token-1',
    groupEntityRef: 'group:default/platform-team',
    name: 'cicd-pipeline',
    scopes: ['catalog:read'],
    expiresAt: new Date('2026-04-10T00:00:00.000Z'),
  });
});

test('findActiveToken returns null for unknown hashes', async () => {
  const db = createInMemoryServiceTokenDatabase({
    tokens: [],
  });

  const result = await db.findActiveToken('missing');

  assert.equal(result, null);
});

test('findActiveToken ignores expired and revoked tokens', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const db = createInMemoryServiceTokenDatabase({
    now: () => now,
    tokens: [
      {
        id: 'expired',
        tokenHash: 'hash-expired',
        groupEntityRef: 'group:default/platform-team',
        name: 'expired-bot',
        scopes: ['catalog:read'],
        expiresAt: new Date('2026-04-01T00:00:00.000Z'),
        revokedAt: null,
        lastUsedAt: null,
      },
      {
        id: 'revoked',
        tokenHash: 'hash-revoked',
        groupEntityRef: 'group:default/platform-team',
        name: 'revoked-bot',
        scopes: ['catalog:read'],
        expiresAt: new Date('2026-04-10T00:00:00.000Z'),
        revokedAt: new Date('2026-04-03T00:00:00.000Z'),
        lastUsedAt: null,
      },
    ],
  });

  assert.equal(await db.findActiveToken('hash-expired'), null);
  assert.equal(await db.findActiveToken('hash-revoked'), null);
});

test('updateLastUsed updates the token timestamp in place', async () => {
  const timestamps = [
    new Date('2026-04-04T12:00:00.000Z'),
    new Date('2026-04-04T12:05:00.000Z'),
  ];
  let index = 0;
  const db = createInMemoryServiceTokenDatabase({
    now: () => timestamps[index++],
    tokens: [
      {
        id: 'token-1',
        tokenHash: 'hash-1',
        groupEntityRef: 'group:default/platform-team',
        name: 'cicd-pipeline',
        scopes: ['catalog:read'],
        expiresAt: new Date('2026-04-10T00:00:00.000Z'),
        revokedAt: null,
        lastUsedAt: null,
      },
    ],
  });

  await db.updateLastUsed('token-1');

  assert.equal(db.__unsafeGetToken('token-1').lastUsedAt?.toISOString(), '2026-04-04T12:00:00.000Z');

  await db.updateLastUsed('token-1');

  assert.equal(db.__unsafeGetToken('token-1').lastUsedAt?.toISOString(), '2026-04-04T12:05:00.000Z');
});

test('updateLastUsed is a no-op for unknown token ids', async () => {
  const db = createInMemoryServiceTokenDatabase({
    tokens: [],
  });

  await db.updateLastUsed('missing');

  assert.equal(db.__unsafeGetToken('missing'), undefined);
});
