export function createInMemoryServiceTokenDatabase(options = {}) {
  const now = options.now ?? (() => new Date());
  const tokens = new Map(
    (options.tokens ?? []).map(token => [
      token.id,
      {
        ...token,
      },
    ]),
  );
  const auditEvents = (options.auditEvents ?? []).map(event => ({
    ...event,
  }));

  return {
    async findActiveToken(tokenHash) {
      for (const token of tokens.values()) {
        if (token.tokenHash !== tokenHash) {
          continue;
        }

        if (token.revokedAt) {
          return null;
        }

        if (token.expiresAt < now()) {
          return null;
        }

        return {
          id: token.id,
          groupEntityRef: token.groupEntityRef,
          name: token.name,
          scopes: token.scopes,
          expiresAt: token.expiresAt,
        };
      }

      return null;
    },

    async updateLastUsed(id) {
      const token = tokens.get(id);
      if (!token) {
        return;
      }

      token.lastUsedAt = now();
    },

    async findTokenByName(groupEntityRef, name) {
      for (const token of tokens.values()) {
        if (token.groupEntityRef === groupEntityRef && token.name === name) {
          return token;
        }
      }

      return null;
    },

    async createTokenRecord(record) {
      tokens.set(record.id, {
        ...record,
      });
    },

    async getTokenRecord(id) {
      return tokens.get(id) ?? null;
    },

    async getToken(id, options = {}) {
      const token = tokens.get(id);
      if (!token) {
        return null;
      }

      const currentTime = options.now ?? now();

      return {
        id: token.id,
        name: token.name,
        description: token.description,
        tokenPrefix: token.tokenPrefix,
        groupEntityRef: token.groupEntityRef,
        scopes: token.scopes,
        createdBy: token.createdBy,
        createdAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
        lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
        revokedAt: token.revokedAt ? token.revokedAt.toISOString() : null,
        revokedBy: token.revokedBy,
        status: computeStatus(token, currentTime),
      };
    },

    async listTokens(filters = {}, options = {}) {
      const currentTime = options.now ?? now();
      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? 50;

      const formatted = Array.from(tokens.values())
        .map(token => ({
        id: token.id,
        name: token.name,
        description: token.description,
        tokenPrefix: token.tokenPrefix,
        groupEntityRef: token.groupEntityRef,
        scopes: token.scopes,
        createdBy: token.createdBy,
        createdAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
        lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
        revokedAt: token.revokedAt ? token.revokedAt.toISOString() : null,
        revokedBy: token.revokedBy,
        status: computeStatus(token, currentTime),
        }))
        .filter(token => {
          if (filters.groupEntityRef && token.groupEntityRef !== filters.groupEntityRef) {
            return false;
          }

          if (filters.status && token.status !== filters.status) {
            return false;
          }

          return true;
        });

      return {
        tokens: formatted.slice(offset, offset + limit),
        total: formatted.length,
      };
    },

    async revokeTokenRecord(id, revokeData) {
      const token = tokens.get(id);
      if (!token) {
        return;
      }

      token.revokedAt = revokeData.revokedAt;
      token.revokedBy = revokeData.revokedBy;
    },

    async appendAuditEvent(event) {
      auditEvents.push({
        ...event,
      });
    },

    async getAuditLog(tokenId) {
      return auditEvents
        .filter(event => event.tokenId === tokenId)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .map(event => ({
          id: event.id,
          tokenId: event.tokenId,
          event: event.event,
          actor: event.actor,
          metadata: event.metadata,
          occurredAt: event.occurredAt.toISOString(),
        }));
    },

    __unsafeGetToken(id) {
      return tokens.get(id);
    },
  };
}

export function createKnexServiceTokenDatabase(options) {
  const client = options.client;
  const now = options.now ?? (() => new Date());

  return {
    async findActiveToken(tokenHash) {
      const row = await client('service_access_tokens')
        .where({ token_hash: tokenHash })
        .whereNull('revoked_at')
        .andWhere('expires_at', '>', now().toISOString())
        .first();

      if (!row) {
        return null;
      }

      const token = mapTokenRow(row);
      return {
        id: token.id,
        groupEntityRef: token.groupEntityRef,
        name: token.name,
        scopes: token.scopes,
        expiresAt: token.expiresAt,
      };
    },

    async updateLastUsed(id) {
      await client('service_access_tokens')
        .where({ id })
        .update({ last_used_at: now().toISOString() });
    },

    async findTokenByName(groupEntityRef, name) {
      const row = await client('service_access_tokens')
        .where({
          group_entity_ref: groupEntityRef,
          name,
        })
        .first();

      return row ? mapTokenRow(row) : null;
    },

    async createTokenRecord(record) {
      await client('service_access_tokens').insert(toTokenRow(record));
    },

    async getTokenRecord(id) {
      const row = await client('service_access_tokens').where({ id }).first();
      return row ? mapTokenRow(row) : null;
    },

    async getToken(id, options = {}) {
      const row = await client('service_access_tokens').where({ id }).first();
      if (!row) {
        return null;
      }

      const token = mapTokenRow(row);
      return formatTokenRecord(token, options.now ?? now());
    },

    async listTokens(filters = {}, options = {}) {
      const currentTime = options.now ?? now();
      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? 50;

      const rows = await client('service_access_tokens').orderBy('created_at', 'desc');
      const tokens = rows
        .map(mapTokenRow)
        .map(token => formatTokenRecord(token, currentTime))
        .filter(token => {
          if (filters.groupEntityRef && token.groupEntityRef !== filters.groupEntityRef) {
            return false;
          }

          if (filters.status && token.status !== filters.status) {
            return false;
          }

          return true;
        });

      return {
        tokens: tokens.slice(offset, offset + limit),
        total: tokens.length,
      };
    },

    async revokeTokenRecord(id, revokeData) {
      await client('service_access_tokens')
        .where({ id })
        .update({
          revoked_at: revokeData.revokedAt.toISOString(),
          revoked_by: revokeData.revokedBy,
        });
    },

    async appendAuditEvent(event) {
      await client('service_access_token_audit_log').insert({
        id: event.id,
        token_id: event.tokenId,
        event: event.event,
        actor: event.actor,
        metadata: JSON.stringify(event.metadata ?? {}),
        occurred_at: event.occurredAt.toISOString(),
      });
    },

    async getAuditLog(tokenId) {
      const rows = await client('service_access_token_audit_log')
        .where({ token_id: tokenId })
        .orderBy('occurred_at', 'desc');

      return rows.map(row => ({
        id: row.id,
        tokenId: row.token_id,
        event: row.event,
        actor: row.actor,
        metadata: parseJson(row.metadata, {}),
        occurredAt: toDate(row.occurred_at).toISOString(),
      }));
    },
  };
}

export function computeStatus(token, now) {
  if (token.revokedAt) {
    return 'revoked';
  }

  if (token.expiresAt < now) {
    return 'expired';
  }

  const expiringThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (token.expiresAt < expiringThreshold) {
    return 'expiring';
  }

  return 'active';
}

function formatTokenRecord(token, now) {
  return {
    id: token.id,
    name: token.name,
    description: token.description,
    tokenPrefix: token.tokenPrefix,
    groupEntityRef: token.groupEntityRef,
    scopes: token.scopes,
    createdBy: token.createdBy,
    createdAt: token.createdAt.toISOString(),
    expiresAt: token.expiresAt.toISOString(),
    lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
    revokedAt: token.revokedAt ? token.revokedAt.toISOString() : null,
    revokedBy: token.revokedBy,
    status: computeStatus(token, now),
  };
}

function mapTokenRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tokenHash: row.token_hash,
    tokenPrefix: row.token_prefix,
    groupEntityRef: row.group_entity_ref,
    scopes: parseJson(row.scopes, []),
    createdBy: row.created_by,
    createdAt: toDate(row.created_at),
    expiresAt: toDate(row.expires_at),
    lastUsedAt: row.last_used_at ? toDate(row.last_used_at) : null,
    revokedAt: row.revoked_at ? toDate(row.revoked_at) : null,
    revokedBy: row.revoked_by,
  };
}

function toTokenRow(record) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    token_hash: record.tokenHash,
    token_prefix: record.tokenPrefix,
    group_entity_ref: record.groupEntityRef,
    scopes: JSON.stringify(record.scopes),
    created_by: record.createdBy,
    created_at: record.createdAt.toISOString(),
    expires_at: record.expiresAt.toISOString(),
    last_used_at: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
    revoked_at: record.revokedAt ? record.revokedAt.toISOString() : null,
    revoked_by: record.revokedBy,
  };
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}
