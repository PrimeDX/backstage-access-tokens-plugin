import test from 'node:test';
import assert from 'node:assert/strict';

import { createTokenCache } from './cache.js';

test('cache misses unknown entries', () => {
  const cache = createTokenCache({ ttlSeconds: 60 });

  assert.equal(cache.get('missing'), null);
});

test('cache returns a stored entry before expiry', () => {
  const cache = createTokenCache({ ttlSeconds: 60 });

  cache.set('hash-1', { subject: 'service-token:group:default/team:bot', scopes: ['catalog:read'] });

  assert.deepEqual(cache.get('hash-1'), {
    subject: 'service-token:group:default/team:bot',
    scopes: ['catalog:read'],
  });
});

test('cache returns empty scopes when none were stored', () => {
  const cache = createTokenCache({ ttlSeconds: 60 });

  cache.set('hash-1', { subject: 'service-token:group:default/team:bot' });

  assert.deepEqual(cache.get('hash-1'), {
    subject: 'service-token:group:default/team:bot',
    scopes: [],
  });
});

test('cache expires entries after the ttl window', async () => {
  const cache = createTokenCache({ ttlSeconds: 0.01 });

  cache.set('hash-1', { subject: 'service-token:group:default/team:bot', scopes: ['catalog:read'] });

  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(cache.get('hash-1'), null);
});

test('cache invalidate removes a specific entry', () => {
  const cache = createTokenCache({ ttlSeconds: 60 });

  cache.set('hash-1', { subject: 'service-token:group:default/team:bot', scopes: ['catalog:read'] });
  cache.invalidate('hash-1');

  assert.equal(cache.get('hash-1'), null);
});

test('cache clear removes all entries', () => {
  const cache = createTokenCache({ ttlSeconds: 60 });

  cache.set('hash-1', { subject: 'service-token:group:default/team:bot', scopes: ['catalog:read'] });
  cache.set('hash-2', { subject: 'service-token:group:default/team:bot-2', scopes: ['catalog:write'] });
  cache.clear();

  assert.equal(cache.get('hash-1'), null);
  assert.equal(cache.get('hash-2'), null);
});
