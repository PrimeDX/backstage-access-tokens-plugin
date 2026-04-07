import test from 'node:test';
import assert from 'node:assert/strict';

import { createKnexServiceTokenDatabase } from './database.js';
import { applyServiceTokenMigrations } from './migrations.js';
import { createSqliteClient } from './sqliteTestUtils.js';

test('knex database persists token records and returns computed status views', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);
    const db = createKnexServiceTokenDatabase({
      client,
      now: () => now,
    });

    await db.createTokenRecord({
      id: 'token-1',
      name: 'ci-bot',
      description: 'CI token',
      tokenHash: 'hash-1',
      tokenPrefix: 'bsst_abcd123',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read', 'techdocs:read'],
      createdBy: 'user:default/admin',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      expiresAt: new Date('2026-04-20T00:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    });

    const byName = await db.findTokenByName('group:default/platform-team', 'ci-bot');
    assert.equal(byName?.tokenHash, 'hash-1');
    assert.deepEqual(byName?.scopes, ['catalog:read', 'techdocs:read']);

    const token = await db.getToken('token-1', { now });
    assert.deepEqual(token, {
      id: 'token-1',
      name: 'ci-bot',
      description: 'CI token',
      tokenPrefix: 'bsst_abcd123',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read', 'techdocs:read'],
      createdBy: 'user:default/admin',
      createdAt: '2026-04-01T00:00:00.000Z',
      expiresAt: '2026-04-20T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
      status: 'expiring',
    });

    const listed = await db.listTokens({}, { now });
    assert.equal(listed.total, 1);
    assert.equal(listed.tokens[0].id, 'token-1');
    assert.equal(listed.tokens[0].status, 'expiring');
  } finally {
    await client.destroy();
  }
});

test('knex database findActiveToken excludes expired and revoked tokens and updates last used', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);
    const db = createKnexServiceTokenDatabase({
      client,
      now: () => now,
    });

    await db.createTokenRecord({
      id: 'active',
      name: 'active-token',
      description: 'Active token',
      tokenHash: 'hash-active',
      tokenPrefix: 'bsst_active1',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      createdBy: 'user:default/admin',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      expiresAt: new Date('2026-05-10T00:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    });
    await db.createTokenRecord({
      id: 'expired',
      name: 'expired-token',
      description: 'Expired token',
      tokenHash: 'hash-expired',
      tokenPrefix: 'bsst_expired',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      createdBy: 'user:default/admin',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      expiresAt: new Date('2026-04-02T00:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    });
    await db.createTokenRecord({
      id: 'revoked',
      name: 'revoked-token',
      description: 'Revoked token',
      tokenHash: 'hash-revoked',
      tokenPrefix: 'bsst_revoked',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      createdBy: 'user:default/admin',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      expiresAt: new Date('2026-05-10T00:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: new Date('2026-04-03T00:00:00.000Z'),
      revokedBy: 'user:default/admin',
    });

    assert.deepEqual(await db.findActiveToken('hash-active'), {
      id: 'active',
      groupEntityRef: 'group:default/platform-team',
      name: 'active-token',
      scopes: ['catalog:read'],
      expiresAt: new Date('2026-05-10T00:00:00.000Z'),
    });
    assert.equal(await db.findActiveToken('hash-expired'), null);
    assert.equal(await db.findActiveToken('hash-revoked'), null);

    await db.updateLastUsed('active');
    const updated = await db.getTokenRecord('active');
    assert.equal(updated?.lastUsedAt?.toISOString(), now.toISOString());
  } finally {
    await client.destroy();
  }
});

test('knex database stores revoke state and returns newest-first audit log', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);
    const db = createKnexServiceTokenDatabase({
      client,
      now: () => now,
    });

    await db.createTokenRecord({
      id: 'token-1',
      name: 'ci-bot',
      description: 'CI token',
      tokenHash: 'hash-1',
      tokenPrefix: 'bsst_abcd123',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      createdBy: 'user:default/admin',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      expiresAt: new Date('2026-05-10T00:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    });

    await db.appendAuditEvent({
      id: 'audit-1',
      tokenId: 'token-1',
      event: 'created',
      actor: 'user:default/admin',
      metadata: { source: 'test' },
      occurredAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    await db.revokeTokenRecord('token-1', {
      revokedAt: new Date('2026-04-03T00:00:00.000Z'),
      revokedBy: 'user:default/security-admin',
    });
    await db.appendAuditEvent({
      id: 'audit-2',
      tokenId: 'token-1',
      event: 'revoked',
      actor: 'user:default/security-admin',
      metadata: { reason: 'rotation' },
      occurredAt: new Date('2026-04-03T00:00:00.000Z'),
    });

    const token = await db.getToken('token-1', { now });
    assert.equal(token?.status, 'revoked');
    assert.equal(token?.revokedBy, 'user:default/security-admin');
    assert.equal(token?.revokedAt, '2026-04-03T00:00:00.000Z');

    const events = await db.getAuditLog('token-1');
    assert.deepEqual(events.map(event => event.id), ['audit-2', 'audit-1']);
    assert.deepEqual(events[0].metadata, { reason: 'rotation' });
    assert.deepEqual(events[1].metadata, { source: 'test' });
  } finally {
    await client.destroy();
  }
});
