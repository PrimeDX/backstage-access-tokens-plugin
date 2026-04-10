export async function applyServiceTokenMigrations(client) {
  const hasTokensTable = await client.schema.hasTable('service_tokens');
  if (!hasTokensTable) {
    await client.schema.createTable('service_tokens', table => {
      table.string('id', 36).primary();
      table.string('name', 100).notNullable();
      table.text('description').notNullable();
      table.string('token_hash', 64).notNullable().unique();
      table.string('token_prefix', 12).notNullable();
      table.string('group_entity_ref', 255).notNullable();
      table.text('scopes').notNullable();
      table.string('created_by', 255).notNullable();
      table.dateTime('created_at').notNullable();
      table.dateTime('expires_at').notNullable();
      table.dateTime('last_used_at').nullable();
      table.dateTime('revoked_at').nullable();
      table.string('revoked_by', 255).nullable();
      table.unique(['group_entity_ref', 'name'], 'uq_service_tokens_group_name');
      table.index(['token_hash'], 'idx_service_tokens_hash');
      table.index(['group_entity_ref'], 'idx_service_tokens_group');
      table.index(['expires_at'], 'idx_service_tokens_expires');
      table.index(['revoked_at'], 'idx_service_tokens_revoked');
    });
  }

  const hasAuditTable = await client.schema.hasTable('service_token_audit_log');
  if (!hasAuditTable) {
    await client.schema.createTable('service_token_audit_log', table => {
      table.string('id', 36).primary();
      table.string('token_id', 36).notNullable().references('id').inTable('service_tokens');
      table.string('event', 50).notNullable();
      table.string('actor', 255).nullable();
      table.text('metadata').nullable();
      table.dateTime('occurred_at').notNullable();
      table.index(['token_id'], 'idx_audit_token_id');
      table.index(['occurred_at'], 'idx_audit_occurred');
    });
  }
}
