import test from 'node:test';
import assert from 'node:assert/strict';

import { applyServiceTokenMigrations } from './migrations.js';
import { createSqliteClient } from './sqliteTestUtils.js';

test('service token migrations create both tables with required columns', async () => {
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);

    assert.equal(await client.schema.hasTable('service_tokens'), true);
    assert.equal(await client.schema.hasTable('service_token_audit_log'), true);

    for (const column of [
      'id',
      'name',
      'description',
      'token_hash',
      'token_prefix',
      'group_entity_ref',
      'scopes',
      'created_by',
      'created_at',
      'expires_at',
      'last_used_at',
      'revoked_at',
      'revoked_by',
    ]) {
      assert.equal(await client.schema.hasColumn('service_tokens', column), true, column);
    }

    for (const column of ['id', 'token_id', 'event', 'actor', 'metadata', 'occurred_at']) {
      assert.equal(await client.schema.hasColumn('service_token_audit_log', column), true, column);
    }
  } finally {
    await client.destroy();
  }
});

test('service token migrations are idempotent', async () => {
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);
    await applyServiceTokenMigrations(client);

    const tokenTables = await client('sqlite_master')
      .where({ type: 'table', name: 'service_tokens' })
      .count({ count: '*' })
      .first();
    const auditTables = await client('sqlite_master')
      .where({ type: 'table', name: 'service_token_audit_log' })
      .count({ count: '*' })
      .first();

    assert.equal(Number(tokenTables.count), 1);
    assert.equal(Number(auditTables.count), 1);
  } finally {
    await client.destroy();
  }
});

test('user token migrations create all required tables and columns', async () => {
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);

    assert.equal(await client.schema.hasTable('user_tokens'), true);
    assert.equal(await client.schema.hasTable('user_token_audit_log'), true);
    assert.equal(await client.schema.hasTable('user_tokens_dcr_client'), true);

    for (const column of [
      'id',
      'name',
      'user_entity_ref',
      'prefix',
      'session_id',
      'encrypted_token',
      'encrypted_token_iv',
      'encrypted_token_tag',
      'created_at',
      'expires_at',
      'last_used_at',
      'revoked_at',
    ]) {
      assert.equal(await client.schema.hasColumn('user_tokens', column), true, column);
    }

    for (const column of ['id', 'token_id', 'event', 'actor', 'metadata', 'occurred_at']) {
      assert.equal(await client.schema.hasColumn('user_token_audit_log', column), true, column);
    }

    for (const column of [
      'id',
      'client_id',
      'client_secret',
      'redirect_uri',
      'source',
      'created_at',
    ]) {
      assert.equal(await client.schema.hasColumn('user_tokens_dcr_client', column), true, column);
    }
  } finally {
    await client.destroy();
  }
});

test('user token migrations are idempotent', async () => {
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);
    await applyServiceTokenMigrations(client);

    for (const tableName of ['user_tokens', 'user_token_audit_log', 'user_tokens_dcr_client']) {
      const row = await client('sqlite_master')
        .where({ type: 'table', name: tableName })
        .count({ count: '*' })
        .first();
      assert.equal(Number(row.count), 1, tableName);
    }
  } finally {
    await client.destroy();
  }
});

test('user_tokens enforces unique (user_entity_ref, name) constraint', async () => {
  const client = createSqliteClient();
  const now = new Date();

  try {
    await applyServiceTokenMigrations(client);

    await client('user_tokens').insert({
      id: 'id-1',
      name: 'my-ci',
      user_entity_ref: 'user:default/alice',
      prefix: 'abc12345',
      session_id: 'sess-1',
      created_at: now,
      expires_at: new Date(now.getTime() + 86_400_000),
    });

    await assert.rejects(async () => {
      await client('user_tokens').insert({
        id: 'id-2',
        name: 'my-ci',
        user_entity_ref: 'user:default/alice',
        prefix: 'def67890',
        session_id: 'sess-2',
        created_at: now,
        expires_at: new Date(now.getTime() + 86_400_000),
      });
    });

    // A different user reusing the same name is fine
    await client('user_tokens').insert({
      id: 'id-3',
      name: 'my-ci',
      user_entity_ref: 'user:default/bob',
      prefix: 'ghi13579',
      session_id: 'sess-3',
      created_at: now,
      expires_at: new Date(now.getTime() + 86_400_000),
    });

    const count = await client('user_tokens').count({ c: '*' }).first();
    assert.equal(Number(count.c), 2);
  } finally {
    await client.destroy();
  }
});
