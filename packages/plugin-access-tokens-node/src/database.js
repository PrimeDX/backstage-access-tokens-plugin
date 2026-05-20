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

export function createServiceTokenAuthDatabase(options) {
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

      return {
        id: row.id,
        groupEntityRef: row.group_entity_ref,
        name: row.name,
        scopes: parseJson(row.scopes, []),
        expiresAt: toDate(row.expires_at),
      };
    },

    async updateLastUsed(id) {
      await client('service_access_tokens')
        .where({ id })
        .update({ last_used_at: now().toISOString() });
    },
  };
}
