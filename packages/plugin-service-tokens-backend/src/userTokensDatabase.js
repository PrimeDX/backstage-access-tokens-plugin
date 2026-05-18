/**
 * Persistence layer for the user-tokens capability. Mirrors the structure
 * of `database.js` (service-tokens) but with a separate set of tables and
 * a different uniqueness contract (per-user instead of per-group).
 *
 * Two variants are exported:
 *   - `createKnexUserTokensDatabase` — production-style, backed by Knex.
 *   - `createInMemoryUserTokensDatabase` — for unit tests.
 *
 * Both expose the same interface so callers can be tested against the
 * in-memory variant.
 *
 * See docs/spec/user-tokens-api.md §2 for the schema and field semantics.
 */

function cloneRecord(record) {
  return {
    ...record,
    encryptedToken: record.encryptedToken
      ? Buffer.from(record.encryptedToken)
      : record.encryptedToken,
    encryptedTokenIv: record.encryptedTokenIv
      ? Buffer.from(record.encryptedTokenIv)
      : record.encryptedTokenIv,
    encryptedTokenTag: record.encryptedTokenTag
      ? Buffer.from(record.encryptedTokenTag)
      : record.encryptedTokenTag,
  };
}

function publicView(record, currentTime) {
  return {
    id: record.id,
    name: record.name,
    userEntityRef: record.userEntityRef,
    prefix: record.prefix,
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt ?? null,
    revokedAt: record.revokedAt ?? null,
    status: computeUserTokenStatus(record, currentTime),
  };
}

export function computeUserTokenStatus(record, currentTime) {
  if (record.revokedAt) {
    return 'revoked';
  }
  if (record.expiresAt && record.expiresAt <= currentTime) {
    return 'expired';
  }
  return 'active';
}

export function createInMemoryUserTokensDatabase(options = {}) {
  const now = options.now ?? (() => new Date());
  const tokens = new Map(
    (options.tokens ?? []).map(token => [token.id, cloneRecord(token)]),
  );
  const audit = (options.auditEvents ?? []).map(event => ({ ...event }));
  let dcrClient = options.dcrClient ? { ...options.dcrClient } : null;

  return {
    async createUserToken(record) {
      tokens.set(record.id, cloneRecord(record));
    },

    async findUserTokenByUserAndName(userEntityRef, name) {
      for (const record of tokens.values()) {
        if (record.userEntityRef === userEntityRef && record.name === name) {
          return cloneRecord(record);
        }
      }
      return null;
    },

    async getUserTokenForUser(id, userEntityRef) {
      const record = tokens.get(id);
      if (!record || record.userEntityRef !== userEntityRef) {
        return null;
      }
      return cloneRecord(record);
    },

    async listUserTokensForUser(userEntityRef, listOptions = {}) {
      const currentTime = listOptions.now ?? now();
      const all = [...tokens.values()]
        .filter(record => record.userEntityRef === userEntityRef)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(record => publicView(record, currentTime));
      return all;
    },

    async updateUserTokenLastUsed(id, when) {
      const record = tokens.get(id);
      if (record) {
        record.lastUsedAt = when ?? now();
      }
    },

    async markUserTokenRevoked(id, when) {
      const record = tokens.get(id);
      if (!record) {
        return false;
      }
      record.revokedAt = when ?? now();
      record.encryptedToken = null;
      record.encryptedTokenIv = null;
      record.encryptedTokenTag = null;
      return true;
    },

    async appendUserAuditEvent(event) {
      audit.push({ ...event });
    },

    async getUserAuditLog(tokenId) {
      return audit
        .filter(event => event.tokenId === tokenId)
        .map(event => ({ ...event }))
        .sort((a, b) => b.occurredAt - a.occurredAt);
    },

    async getDcrClient() {
      return dcrClient ? { ...dcrClient } : null;
    },

    async saveDcrClient(record) {
      dcrClient = { ...record };
    },
  };
}

export function createKnexUserTokensDatabase(options) {
  const client = options.client;
  const now = options.now ?? (() => new Date());

  return {
    async createUserToken(record) {
      await client('user_tokens').insert(toUserTokenRow(record));
    },

    async findUserTokenByUserAndName(userEntityRef, name) {
      const row = await client('user_tokens')
        .where({ user_entity_ref: userEntityRef, name })
        .first();
      return row ? mapUserTokenRow(row) : null;
    },

    async getUserTokenForUser(id, userEntityRef) {
      const row = await client('user_tokens')
        .where({ id, user_entity_ref: userEntityRef })
        .first();
      return row ? mapUserTokenRow(row) : null;
    },

    async listUserTokensForUser(userEntityRef, listOptions = {}) {
      const currentTime = listOptions.now ?? now();
      const rows = await client('user_tokens')
        .where({ user_entity_ref: userEntityRef })
        .orderBy('created_at', 'desc');
      return rows
        .map(mapUserTokenRow)
        .map(record => publicView(record, currentTime));
    },

    async updateUserTokenLastUsed(id, when) {
      const value = (when ?? now()).toISOString();
      await client('user_tokens').where({ id }).update({ last_used_at: value });
    },

    async markUserTokenRevoked(id, when) {
      const updated = await client('user_tokens').where({ id }).update({
        revoked_at: (when ?? now()).toISOString(),
        encrypted_token: null,
        encrypted_token_iv: null,
        encrypted_token_tag: null,
      });
      return updated > 0;
    },

    async appendUserAuditEvent(event) {
      await client('user_token_audit_log').insert({
        id: event.id,
        token_id: event.tokenId,
        event: event.event,
        actor: event.actor ?? null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        occurred_at: event.occurredAt.toISOString(),
      });
    },

    async getUserAuditLog(tokenId) {
      const rows = await client('user_token_audit_log')
        .where({ token_id: tokenId })
        .orderBy('occurred_at', 'desc');
      return rows.map(row => ({
        id: row.id,
        tokenId: row.token_id,
        event: row.event,
        actor: row.actor,
        metadata: parseJson(row.metadata, null),
        occurredAt: toDate(row.occurred_at),
      }));
    },

    async getDcrClient() {
      const row = await client('user_tokens_dcr_client').first();
      if (!row) return null;
      return {
        id: row.id,
        clientId: row.client_id,
        clientSecret: row.client_secret,
        redirectUri: row.redirect_uri,
        source: row.source,
        createdAt: toDate(row.created_at),
      };
    },

    async saveDcrClient(record) {
      // Singleton: there can only be one row. Replace if present.
      await client.transaction(async trx => {
        await trx('user_tokens_dcr_client').del();
        await trx('user_tokens_dcr_client').insert({
          id: record.id,
          client_id: record.clientId,
          client_secret: record.clientSecret,
          redirect_uri: record.redirectUri,
          source: record.source,
          created_at: (record.createdAt ?? now()).toISOString(),
        });
      });
    },
  };
}

function toUserTokenRow(record) {
  return {
    id: record.id,
    name: record.name,
    user_entity_ref: record.userEntityRef,
    prefix: record.prefix,
    session_id: record.sessionId,
    encrypted_token: record.encryptedToken ?? null,
    encrypted_token_iv: record.encryptedTokenIv ?? null,
    encrypted_token_tag: record.encryptedTokenTag ?? null,
    created_at: record.createdAt.toISOString(),
    expires_at: record.expiresAt.toISOString(),
    last_used_at: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
    revoked_at: record.revokedAt ? record.revokedAt.toISOString() : null,
  };
}

function mapUserTokenRow(row) {
  return {
    id: row.id,
    name: row.name,
    userEntityRef: row.user_entity_ref,
    prefix: row.prefix,
    sessionId: row.session_id,
    encryptedToken: row.encrypted_token ? Buffer.from(row.encrypted_token) : null,
    encryptedTokenIv: row.encrypted_token_iv ? Buffer.from(row.encrypted_token_iv) : null,
    encryptedTokenTag: row.encrypted_token_tag ? Buffer.from(row.encrypted_token_tag) : null,
    createdAt: toDate(row.created_at),
    expiresAt: toDate(row.expires_at),
    lastUsedAt: row.last_used_at ? toDate(row.last_used_at) : null,
    revokedAt: row.revoked_at ? toDate(row.revoked_at) : null,
  };
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}
