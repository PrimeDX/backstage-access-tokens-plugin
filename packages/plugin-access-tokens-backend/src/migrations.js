export async function applyServiceTokenMigrations(client) {
  await renameTableIfNeeded(client, 'service_tokens', 'service_access_tokens');
  await renameTableIfNeeded(
    client,
    'service_token_audit_log',
    'service_access_token_audit_log',
  );
  await renameTableIfNeeded(client, 'user_tokens', 'personal_access_tokens');
  await renameTableIfNeeded(
    client,
    'user_token_audit_log',
    'personal_access_token_audit_log',
  );
  await renameTableIfNeeded(
    client,
    'user_tokens_dcr_client',
    'personal_access_tokens_dcr_client',
  );

  const hasTokensTable = await client.schema.hasTable('service_access_tokens');
  if (!hasTokensTable) {
    await client.schema.createTable('service_access_tokens', table => {
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
      table.unique(['group_entity_ref', 'name'], 'uq_service_access_tokens_group_name');
      table.index(['token_hash'], 'idx_service_access_tokens_hash');
      table.index(['group_entity_ref'], 'idx_service_access_tokens_group');
      table.index(['expires_at'], 'idx_service_access_tokens_expires');
      table.index(['revoked_at'], 'idx_service_access_tokens_revoked');
    });
  }

  const hasAuditTable = await client.schema.hasTable('service_access_token_audit_log');
  if (!hasAuditTable) {
    await client.schema.createTable('service_access_token_audit_log', table => {
      table.string('id', 36).primary();
      table.string('token_id', 36).notNullable().references('id').inTable('service_access_tokens');
      table.string('event', 50).notNullable();
      table.string('actor', 255).nullable();
      table.text('metadata').nullable();
      table.dateTime('occurred_at').notNullable();
      table.index(['token_id'], 'idx_audit_token_id');
      table.index(['occurred_at'], 'idx_audit_occurred');
    });
  }

  // personal_access_tokens — user-self-service personal access tokens. See
  // docs/spec/user-tokens-api.md §2.1 for the field-level contract.
  const hasUserTokensTable = await client.schema.hasTable('personal_access_tokens');
  if (!hasUserTokensTable) {
    await client.schema.createTable('personal_access_tokens', table => {
      table.string('id', 36).primary();
      table.string('name', 100).notNullable();
      table.string('user_entity_ref', 255).notNullable();
      table.string('prefix', 16).notNullable();
      table.string('session_id', 64).notNullable();
      // AES-256-GCM ciphertext + 12-byte IV + 16-byte auth tag. Nullable
      // so they can be wiped on successful revocation per
      // docs/spec/user-tokens-architecture.md §3.2 step 4.
      table.binary('encrypted_token').nullable();
      table.binary('encrypted_token_iv').nullable();
      table.binary('encrypted_token_tag').nullable();
      table.dateTime('created_at').notNullable();
      table.dateTime('expires_at').notNullable();
      table.dateTime('last_used_at').nullable();
      table.dateTime('revoked_at').nullable();
      table.unique(['user_entity_ref', 'name'], 'uq_personal_access_tokens_user_name');
      table.index(['user_entity_ref'], 'idx_personal_access_tokens_user');
      table.index(['session_id'], 'idx_personal_access_tokens_session');
      table.index(['expires_at'], 'idx_personal_access_tokens_expires');
    });
  }

  // personal_access_token_audit_log — events for user-token lifecycle. Mirrors the
  // service_access_token_audit_log shape (id, tokenId, event, actor, metadata,
  // occurredAt) per docs/reference/contract-decisions.md.
  const hasUserAuditTable = await client.schema.hasTable('personal_access_token_audit_log');
  if (!hasUserAuditTable) {
    await client.schema.createTable('personal_access_token_audit_log', table => {
      table.string('id', 36).primary();
      table.string('token_id', 36).notNullable().references('id').inTable('personal_access_tokens');
      table.string('event', 50).notNullable();
      table.string('actor', 255).nullable();
      table.text('metadata').nullable();
      table.dateTime('occurred_at').notNullable();
      table.index(['token_id'], 'idx_user_audit_token_id');
      table.index(['occurred_at'], 'idx_user_audit_occurred');
    });
  }

  // personal_access_tokens_dcr_client — singleton row holding the OAuth client this
  // plugin registered (or that the operator pre-configured) for use in
  // the mint flow. Per docs/spec/user-tokens-architecture.md §2.1.
  const hasDcrClientTable = await client.schema.hasTable('personal_access_tokens_dcr_client');
  if (!hasDcrClientTable) {
    await client.schema.createTable('personal_access_tokens_dcr_client', table => {
      table.string('id', 36).primary();
      table.string('client_id', 255).notNullable();
      table.string('client_secret', 512).notNullable();
      table.string('redirect_uri', 1024).notNullable();
      table.string('source', 16).notNullable(); // 'dcr' or 'config'
      table.dateTime('created_at').notNullable();
    });
  }
}

async function renameTableIfNeeded(client, from, to) {
  const [hasFrom, hasTo] = await Promise.all([
    client.schema.hasTable(from),
    client.schema.hasTable(to),
  ]);
  if (hasFrom && !hasTo) {
    await client.schema.renameTable(from, to);
  }
}
