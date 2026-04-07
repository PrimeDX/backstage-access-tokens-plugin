import test from 'node:test';
import assert from 'node:assert/strict';

import { createTokenCache } from './cache.js';
import { sha256hex } from './primitives.js';
import { verifyToken } from './verifyToken.js';

test('verifyToken returns a cached subject and scopes without hitting the database', async () => {
  const token = 'bsst_cached-token';
  const tokenHash = sha256hex(token);
  const cache = createTokenCache({ ttlSeconds: 60 });
  cache.set(tokenHash, {
    subject: 'service-token:group:default/platform-team:cicd-pipeline',
    scopes: ['catalog:read', 'scaffolder:execute'],
  });

  let findActiveTokenCalls = 0;
  const db = {
    async findActiveToken() {
      findActiveTokenCalls += 1;
      return null;
    },
    async updateLastUsed() {},
  };

  const result = await verifyToken(token, {
    cache,
    db,
    logger: { warn() {} },
  });

  assert.deepEqual(result, {
    subject: 'service-token:group:default/platform-team:cicd-pipeline',
    scopes: ['catalog:read', 'scaffolder:execute'],
  });
  assert.equal(findActiveTokenCalls, 0);
});

test('verifyToken returns empty scopes from cache when none were stored', async () => {
  const token = 'bsst_cached-no-scopes';
  const tokenHash = sha256hex(token);
  const cache = createTokenCache({ ttlSeconds: 60 });
  cache.set(tokenHash, {
    subject: 'service-token:group:default/platform-team:cicd-pipeline',
  });

  const db = {
    async findActiveToken() { return null; },
    async updateLastUsed() {},
  };

  const result = await verifyToken(token, {
    cache,
    db,
    logger: { warn() {} },
  });

  assert.deepEqual(result, {
    subject: 'service-token:group:default/platform-team:cicd-pipeline',
    scopes: [],
  });
});

test('verifyToken falls back to the database and populates the cache with scopes', async () => {
  const token = 'bsst_db-token';
  const tokenHash = sha256hex(token);
  const cache = createTokenCache({ ttlSeconds: 60 });

  let findActiveTokenCalls = 0;
  let updatedTokenId;
  const db = {
    async findActiveToken(hash) {
      findActiveTokenCalls += 1;
      assert.equal(hash, tokenHash);
      return {
        id: 'token-1',
        groupEntityRef: 'group:default/platform-team',
        name: 'cicd-pipeline',
        scopes: ['catalog:read'],
      };
    },
    async updateLastUsed(id) {
      updatedTokenId = id;
    },
  };

  const result = await verifyToken(token, {
    cache,
    db,
    logger: { warn() {} },
  });

  assert.deepEqual(result, {
    subject: 'service-token:group:default/platform-team:cicd-pipeline',
    scopes: ['catalog:read'],
  });
  assert.equal(findActiveTokenCalls, 1);
  assert.equal(updatedTokenId, 'token-1');
  assert.deepEqual(cache.get(tokenHash), {
    subject: 'service-token:group:default/platform-team:cicd-pipeline',
    scopes: ['catalog:read'],
  });
});

test('verifyToken defaults to empty scopes when DB record has no scopes', async () => {
  const token = 'bsst_db-no-scopes';
  const cache = createTokenCache({ ttlSeconds: 60 });

  const db = {
    async findActiveToken() {
      return {
        id: 'token-no-scopes',
        groupEntityRef: 'group:default/platform-team',
        name: 'legacy-bot',
      };
    },
    async updateLastUsed() {},
  };

  const result = await verifyToken(token, {
    cache,
    db,
    logger: { warn() {} },
  });

  assert.deepEqual(result, {
    subject: 'service-token:group:default/platform-team:legacy-bot',
    scopes: [],
  });
});

test('verifyToken returns undefined for unknown tokens', async () => {
  const cache = createTokenCache({ ttlSeconds: 60 });

  const db = {
    async findActiveToken() {
      return null;
    },
    async updateLastUsed() {},
  };

  const result = await verifyToken('bsst_missing-token', {
    cache,
    db,
    logger: { warn() {} },
  });

  assert.equal(result, undefined);
});

test('verifyToken does not await updateLastUsed', async () => {
  const token = 'bsst_async-token';
  const cache = createTokenCache({ ttlSeconds: 60 });

  const db = {
    async findActiveToken() {
      return {
        id: 'token-2',
        groupEntityRef: 'group:default/platform-team',
        name: 'deploy-bot',
        scopes: ['scaffolder:execute'],
      };
    },
    updateLastUsed() {
      return new Promise(() => {});
    },
  };

  const result = await verifyToken(token, {
    cache,
    db,
    logger: { warn() {} },
  });

  assert.deepEqual(result, {
    subject: 'service-token:group:default/platform-team:deploy-bot',
    scopes: ['scaffolder:execute'],
  });
});

test('verifyToken logs a warning if updateLastUsed fails', async () => {
  const token = 'bsst_warn-token';
  const cache = createTokenCache({ ttlSeconds: 60 });
  const warnings = [];

  const db = {
    async findActiveToken() {
      return {
        id: 'token-3',
        groupEntityRef: 'group:default/platform-team',
        name: 'warn-bot',
        scopes: ['catalog:read', 'catalog:write'],
      };
    },
    async updateLastUsed() {
      throw new Error('boom');
    },
  };

  const result = await verifyToken(token, {
    cache,
    db,
    logger: {
      warn(message) {
        warnings.push(message);
      },
    },
  });

  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(result, {
    subject: 'service-token:group:default/platform-team:warn-bot',
    scopes: ['catalog:read', 'catalog:write'],
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Failed to update last_used_at: boom/);
});
