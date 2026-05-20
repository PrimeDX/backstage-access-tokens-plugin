import test from 'node:test';
import assert from 'node:assert/strict';

import { createServiceTokenAuthDatabase } from './database.js';

function createFakeClient(rows) {
  function createQueryBuilder() {
    const state = {
      rows,
      filters: [],
      nonNullFilters: [],
      comparisonFilters: [],
      updatePayload: null,
    };

    const builder = {
      where(condition) {
        state.filters.push(condition);
        return builder;
      },
      whereNull(column) {
        state.nonNullFilters.push({ column, expected: null });
        return builder;
      },
      andWhere(column, operator, value) {
        state.comparisonFilters.push({ column, operator, value });
        return builder;
      },
      async first() {
        return state.rows.find(row => matchesRow(row, state)) ?? undefined;
      },
      async update(payload) {
        state.updatePayload = payload;
        for (const row of state.rows) {
          if (matchesRow(row, state)) {
            Object.assign(row, payload);
          }
        }
      },
    };

    return builder;
  }

  return tableName => {
    assert.equal(tableName, 'service_access_tokens');
    return createQueryBuilder();
  };
}

function matchesRow(row, state) {
  for (const condition of state.filters) {
    for (const [key, value] of Object.entries(condition)) {
      if (row[key] !== value) {
        return false;
      }
    }
  }

  for (const filter of state.nonNullFilters) {
    if (row[filter.column] !== filter.expected) {
      return false;
    }
  }

  for (const filter of state.comparisonFilters) {
    if (filter.operator === '>' && !(row[filter.column] > filter.value)) {
      return false;
    }
  }

  return true;
}

test('createServiceTokenAuthDatabase finds only active tokens and updates last used', async () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const rows = [
    {
      id: 'active',
      name: 'ci-bot',
      token_hash: 'hash-active',
      group_entity_ref: 'group:default/platform-team',
      scopes: JSON.stringify(['catalog:read']),
      expires_at: '2026-05-01T00:00:00.000Z',
      revoked_at: null,
      last_used_at: null,
    },
    {
      id: 'expired',
      name: 'old-bot',
      token_hash: 'hash-expired',
      group_entity_ref: 'group:default/platform-team',
      scopes: JSON.stringify(['catalog:read']),
      expires_at: '2026-04-02T00:00:00.000Z',
      revoked_at: null,
      last_used_at: null,
    },
    {
      id: 'revoked',
      name: 'revoked-bot',
      token_hash: 'hash-revoked',
      group_entity_ref: 'group:default/platform-team',
      scopes: JSON.stringify(['catalog:read']),
      expires_at: '2026-05-01T00:00:00.000Z',
      revoked_at: '2026-04-03T00:00:00.000Z',
      last_used_at: null,
    },
  ];

  const db = createServiceTokenAuthDatabase({
    client: createFakeClient(rows),
    now: () => now,
  });

  assert.deepEqual(await db.findActiveToken('hash-active'), {
    id: 'active',
    groupEntityRef: 'group:default/platform-team',
    name: 'ci-bot',
    scopes: ['catalog:read'],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  });
  assert.equal(await db.findActiveToken('hash-expired'), null);
  assert.equal(await db.findActiveToken('hash-revoked'), null);

  await db.updateLastUsed('active');
  assert.equal(rows[0].last_used_at, '2026-04-04T12:00:00.000Z');
});
