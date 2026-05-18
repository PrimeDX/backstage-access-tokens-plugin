import test from 'node:test';
import assert from 'node:assert/strict';

import { applyServiceTokenMigrations } from './migrations.js';
import {
  computeUserTokenStatus,
  createInMemoryUserTokensDatabase,
  createKnexUserTokensDatabase,
} from './userTokensDatabase.js';
import { createSqliteClient } from './sqliteTestUtils.js';

function sampleRecord(overrides = {}) {
  const now = new Date('2026-05-19T12:00:00.000Z');
  return {
    id: 'tok-1',
    name: 'my-ci',
    userEntityRef: 'user:default/alice',
    prefix: 'abc12345',
    sessionId: 'sess-abc',
    encryptedToken: Buffer.from('ciphertext'),
    encryptedTokenIv: Buffer.from('iv-12-bytes-'),
    encryptedTokenTag: Buffer.from('tag-16-bytes----'),
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

test('computeUserTokenStatus distinguishes active / expired / revoked', () => {
  const now = new Date();
  const past = new Date(now.getTime() - 1000);
  const future = new Date(now.getTime() + 1000);

  assert.equal(
    computeUserTokenStatus({ revokedAt: null, expiresAt: future }, now),
    'active',
  );
  assert.equal(
    computeUserTokenStatus({ revokedAt: null, expiresAt: past }, now),
    'expired',
  );
  assert.equal(
    computeUserTokenStatus({ revokedAt: past, expiresAt: future }, now),
    'revoked',
  );
});

// ---------- In-memory variant ----------

test('in-memory: createUserToken + getUserTokenForUser round-trip', async () => {
  const db = createInMemoryUserTokensDatabase();
  await db.createUserToken(sampleRecord());

  const fetched = await db.getUserTokenForUser('tok-1', 'user:default/alice');
  assert.equal(fetched.id, 'tok-1');
  assert.equal(fetched.name, 'my-ci');
  assert.equal(fetched.userEntityRef, 'user:default/alice');
});

test('in-memory: getUserTokenForUser scopes to the calling user', async () => {
  const db = createInMemoryUserTokensDatabase();
  await db.createUserToken(sampleRecord());

  // Another user attempting to read alice's token sees null
  assert.equal(await db.getUserTokenForUser('tok-1', 'user:default/bob'), null);
});

test('in-memory: findUserTokenByUserAndName respects the uniqueness scope', async () => {
  const db = createInMemoryUserTokensDatabase();
  await db.createUserToken(sampleRecord());

  const hit = await db.findUserTokenByUserAndName('user:default/alice', 'my-ci');
  assert.equal(hit.id, 'tok-1');

  const miss = await db.findUserTokenByUserAndName('user:default/bob', 'my-ci');
  assert.equal(miss, null);
});

test('in-memory: listUserTokensForUser returns only the calling user\'s rows, newest first', async () => {
  const db = createInMemoryUserTokensDatabase();
  const earlier = new Date('2026-04-01T00:00:00Z');
  const later = new Date('2026-05-01T00:00:00Z');
  await db.createUserToken(sampleRecord({ id: 'a', createdAt: earlier, name: 'older' }));
  await db.createUserToken(sampleRecord({ id: 'b', createdAt: later, name: 'newer' }));
  await db.createUserToken(
    sampleRecord({ id: 'c', userEntityRef: 'user:default/bob', name: 'others' }),
  );

  const list = await db.listUserTokensForUser('user:default/alice', { now: () => later });
  assert.deepEqual(
    list.map(r => r.id),
    ['b', 'a'],
  );
  assert.ok(list.every(r => r.userEntityRef === 'user:default/alice'));
});

test('in-memory: markUserTokenRevoked nulls ciphertext columns and sets revokedAt', async () => {
  const db = createInMemoryUserTokensDatabase();
  await db.createUserToken(sampleRecord());

  const at = new Date('2026-05-20T00:00:00Z');
  const ok = await db.markUserTokenRevoked('tok-1', at);
  assert.equal(ok, true);

  const after = await db.getUserTokenForUser('tok-1', 'user:default/alice');
  assert.equal(after.revokedAt.toISOString(), at.toISOString());
  assert.equal(after.encryptedToken, null);
  assert.equal(after.encryptedTokenIv, null);
  assert.equal(after.encryptedTokenTag, null);
});

test('in-memory: markUserTokenRevoked returns false for unknown id', async () => {
  const db = createInMemoryUserTokensDatabase();
  assert.equal(await db.markUserTokenRevoked('does-not-exist', new Date()), false);
});

test('in-memory: appendUserAuditEvent + getUserAuditLog return newest first', async () => {
  const db = createInMemoryUserTokensDatabase();
  await db.appendUserAuditEvent({
    id: 'e1',
    tokenId: 'tok-1',
    event: 'MINTED',
    actor: 'user:default/alice',
    metadata: null,
    occurredAt: new Date('2026-05-01T00:00:00Z'),
  });
  await db.appendUserAuditEvent({
    id: 'e2',
    tokenId: 'tok-1',
    event: 'REVOKED',
    actor: 'user:default/alice',
    metadata: { reason: 'rotation' },
    occurredAt: new Date('2026-05-02T00:00:00Z'),
  });

  const events = await db.getUserAuditLog('tok-1');
  assert.deepEqual(
    events.map(e => e.id),
    ['e2', 'e1'],
  );
});

test('in-memory: DCR client get/save round-trip', async () => {
  const db = createInMemoryUserTokensDatabase();
  assert.equal(await db.getDcrClient(), null);

  await db.saveDcrClient({
    id: 'dcr-1',
    clientId: 'cid',
    clientSecret: 'csec',
    redirectUri: 'https://example/cb',
    source: 'dcr',
    createdAt: new Date('2026-05-01T00:00:00Z'),
  });

  const fetched = await db.getDcrClient();
  assert.equal(fetched.clientId, 'cid');
  assert.equal(fetched.source, 'dcr');
});

// ---------- Knex (SQLite) variant ----------

test('knex: full lifecycle against SQLite', async () => {
  const client = createSqliteClient();
  await applyServiceTokenMigrations(client);

  try {
    const db = createKnexUserTokensDatabase({ client });

    await db.createUserToken(sampleRecord());

    const fetched = await db.getUserTokenForUser('tok-1', 'user:default/alice');
    assert.equal(fetched.name, 'my-ci');
    assert.ok(Buffer.isBuffer(fetched.encryptedToken));

    await db.appendUserAuditEvent({
      id: 'e1',
      tokenId: 'tok-1',
      event: 'MINTED',
      actor: 'user:default/alice',
      metadata: { source: 'oauth' },
      occurredAt: new Date('2026-05-19T12:00:00Z'),
    });
    const events = await db.getUserAuditLog('tok-1');
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].metadata, { source: 'oauth' });

    await db.updateUserTokenLastUsed('tok-1', new Date('2026-05-20T00:00:00Z'));
    const afterUse = await db.getUserTokenForUser('tok-1', 'user:default/alice');
    assert.equal(afterUse.lastUsedAt.toISOString(), '2026-05-20T00:00:00.000Z');

    const revokedOk = await db.markUserTokenRevoked('tok-1', new Date('2026-05-21T00:00:00Z'));
    assert.equal(revokedOk, true);
    const afterRevoke = await db.getUserTokenForUser('tok-1', 'user:default/alice');
    assert.equal(afterRevoke.encryptedToken, null);
    assert.equal(afterRevoke.encryptedTokenIv, null);
    assert.equal(afterRevoke.encryptedTokenTag, null);
    assert.equal(afterRevoke.revokedAt.toISOString(), '2026-05-21T00:00:00.000Z');
  } finally {
    await client.destroy();
  }
});

test('knex: cross-user scoping in getUserTokenForUser', async () => {
  const client = createSqliteClient();
  await applyServiceTokenMigrations(client);

  try {
    const db = createKnexUserTokensDatabase({ client });
    await db.createUserToken(sampleRecord());

    assert.equal(await db.getUserTokenForUser('tok-1', 'user:default/bob'), null);
    assert.notEqual(await db.getUserTokenForUser('tok-1', 'user:default/alice'), null);
  } finally {
    await client.destroy();
  }
});

test('knex: DCR client saveDcrClient replaces the singleton row', async () => {
  const client = createSqliteClient();
  await applyServiceTokenMigrations(client);

  try {
    const db = createKnexUserTokensDatabase({ client });
    await db.saveDcrClient({
      id: 'dcr-1',
      clientId: 'a',
      clientSecret: 's',
      redirectUri: 'https://e/cb',
      source: 'dcr',
    });
    await db.saveDcrClient({
      id: 'dcr-2',
      clientId: 'b',
      clientSecret: 's2',
      redirectUri: 'https://e/cb',
      source: 'config',
    });

    const row = await db.getDcrClient();
    assert.equal(row.clientId, 'b');

    const count = await client('user_tokens_dcr_client').count({ c: '*' }).first();
    assert.equal(Number(count.c), 1);
  } finally {
    await client.destroy();
  }
});
