import test from 'node:test';
import assert from 'node:assert/strict';

import { createTokenCache } from './cache.js';
import { sha256hex } from './primitives.js';
import { createScopeResolver } from './resolveTokenScopes.js';

test('resolveTokenScopes returns scopes for a cached token', () => {
  const cache = createTokenCache({ ttlSeconds: 60 });
  const rawToken = 'bsst_resolve-test';
  const hash = sha256hex(rawToken);
  cache.set(hash, {
    subject: 'service-token:group:default/team:bot',
    scopes: ['catalog:read', 'scaffolder:execute'],
  });

  const resolve = createScopeResolver(cache);
  const scopes = resolve(rawToken);

  assert.deepEqual(scopes, ['catalog:read', 'scaffolder:execute']);
});

test('resolveTokenScopes returns empty array for uncached token', () => {
  const cache = createTokenCache({ ttlSeconds: 60 });
  const resolve = createScopeResolver(cache);

  const scopes = resolve('bsst_unknown-token');

  assert.deepEqual(scopes, []);
});

test('resolveTokenScopes returns empty array for expired cache entry', async () => {
  const cache = createTokenCache({ ttlSeconds: 0.01 });
  const rawToken = 'bsst_expired-test';
  const hash = sha256hex(rawToken);
  cache.set(hash, {
    subject: 'service-token:group:default/team:bot',
    scopes: ['catalog:read'],
  });

  await new Promise(resolve => setTimeout(resolve, 20));

  const resolve = createScopeResolver(cache);
  const scopes = resolve(rawToken);

  assert.deepEqual(scopes, []);
});

test('resolveTokenScopes returns empty array for null/undefined token', () => {
  const cache = createTokenCache({ ttlSeconds: 60 });
  const resolve = createScopeResolver(cache);

  assert.deepEqual(resolve(null), []);
  assert.deepEqual(resolve(undefined), []);
  assert.deepEqual(resolve(''), []);
});

test('resolveTokenScopes returns empty array when cache entry has no scopes', () => {
  const cache = createTokenCache({ ttlSeconds: 60 });
  const rawToken = 'bsst_no-scopes';
  const hash = sha256hex(rawToken);
  cache.set(hash, {
    subject: 'service-token:group:default/team:bot',
  });

  const resolve = createScopeResolver(cache);
  const scopes = resolve(rawToken);

  assert.deepEqual(scopes, []);
});
