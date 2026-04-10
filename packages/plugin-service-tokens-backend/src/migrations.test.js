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
