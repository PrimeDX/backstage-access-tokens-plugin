import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  createMintFlowStore,
  deriveCodeChallenge,
  generatePkceVerifier,
} from './userTokensMintFlow.js';

test('generatePkceVerifier produces a 43-128 char base64url string', () => {
  const v = generatePkceVerifier();
  assert.ok(v.length >= 43 && v.length <= 128, `length=${v.length}`);
  assert.match(v, /^[A-Za-z0-9_-]+$/);
});

test('deriveCodeChallenge is SHA-256 + base64url of the verifier', () => {
  const v = 'fixed-verifier-for-determinism-12345';
  const expected = createHash('sha256').update(v).digest('base64url');
  assert.equal(deriveCodeChallenge(v), expected);
});

test('create returns flowId, state and codeVerifier', () => {
  const store = createMintFlowStore();
  const out = store.create({ userEntityRef: 'user:default/alice', name: 'a' });
  assert.match(out.flowId, /^[0-9a-f]{32}$/);
  assert.ok(out.state.length >= 32);
  assert.ok(out.codeVerifier.length >= 43);
  assert.equal(store.size(), 1);
});

test('consume returns the entry exactly once (single-use)', () => {
  const store = createMintFlowStore();
  const { state, flowId, codeVerifier } = store.create({
    userEntityRef: 'user:default/alice',
    name: 'a',
  });

  const first = store.consume(state);
  assert.equal(first.flowId, flowId);
  assert.equal(first.codeVerifier, codeVerifier);
  assert.equal(first.userEntityRef, 'user:default/alice');
  assert.equal(first.name, 'a');

  const second = store.consume(state);
  assert.equal(second, null);
});

test('consume returns null for unknown state', () => {
  const store = createMintFlowStore();
  assert.equal(store.consume('not-a-real-state'), null);
});

test('expired entries are purged on next operation', () => {
  let t = 1_000_000;
  const store = createMintFlowStore({
    now: () => new Date(t),
    ttlMs: 100,
  });

  const { state } = store.create({ userEntityRef: 'user:default/alice', name: 'a' });
  assert.equal(store.size(), 1);

  // Past the TTL
  t += 200;
  const result = store.consume(state);
  assert.equal(result, null);
  assert.equal(store.size(), 0);
});

test('preserves the optional expiresAt input', () => {
  const exp = new Date('2026-06-01T00:00:00Z');
  const store = createMintFlowStore();
  const { state } = store.create({
    userEntityRef: 'user:default/alice',
    name: 'a',
    expiresAt: exp,
  });

  const out = store.consume(state);
  assert.equal(out.expiresAt.toISOString(), exp.toISOString());
});

test('purgeExpired reports the number removed without other operations', () => {
  let t = 0;
  const store = createMintFlowStore({ now: () => new Date(t), ttlMs: 100 });
  store.create({ userEntityRef: 'u', name: 'a' });
  store.create({ userEntityRef: 'u', name: 'b' });

  // Without advancing time, nothing to purge.
  assert.equal(store.purgeExpired(), 0);
  assert.equal(store.size(), 2);

  // Past TTL — both expire; an explicit purge clears them.
  t += 200;
  assert.equal(store.purgeExpired(), 2);
  assert.equal(store.size(), 0);
});
