import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { missingAuthBackendFlags, readUserTokensConfig } from './userTokensConfig.js';

// Minimal Config stub matching the methods our reader uses.
function makeConfig(tree) {
  function wrap(node, _path) {
    if (node === undefined || node === null) {
      return undefined;
    }
    const navigate = (key) => {
      const segments = key.split('.');
      let cursor = node;
      for (const segment of segments) {
        if (cursor === undefined || cursor === null) {
          return undefined;
        }
        cursor = cursor[segment];
      }
      return cursor;
    };
    return {
      getOptionalConfig(key) {
        const sub = navigate(key);
        return sub && typeof sub === 'object' && !Array.isArray(sub) ? wrap(sub) : undefined;
      },
      getOptionalBoolean(key) {
        const value = navigate(key);
        return typeof value === 'boolean' ? value : undefined;
      },
      getOptionalNumber(key) {
        const value = navigate(key);
        return typeof value === 'number' ? value : undefined;
      },
      getOptionalString(key) {
        const value = navigate(key);
        return typeof value === 'string' ? value : undefined;
      },
      getString(key) {
        const value = navigate(key);
        if (typeof value !== 'string') {
          throw new Error(`required string missing at ${key}`);
        }
        return value;
      },
    };
  }
  return wrap(tree);
}

const validKeyBase64 = randomBytes(32).toString('base64');

test('readUserTokensConfig requires the userTokens block', () => {
  const config = makeConfig({ serviceTokens: {} });
  assert.throws(() => readUserTokensConfig(config), /required/);
});

test('readUserTokensConfig requires the encryption key', () => {
  const config = makeConfig({ serviceTokens: { userTokens: {} } });
  assert.throws(() => readUserTokensConfig(config), /encryptionKey/);
});

test('readUserTokensConfig rejects a malformed encryption key', () => {
  const config = makeConfig({
    serviceTokens: { userTokens: { encryptionKey: 'short' } },
  });
  assert.throws(() => readUserTokensConfig(config), /32 bytes/);
});

test('readUserTokensConfig fills sane defaults when only the key is provided', () => {
  const config = makeConfig({
    serviceTokens: { userTokens: { encryptionKey: validKeyBase64 } },
  });
  const out = readUserTokensConfig(config);
  assert.equal(out.enabled, true);
  assert.equal(out.defaultExpiryDays, 30);
  assert.equal(out.maxExpiryDays, 365);
  assert.equal(out.encryptionKey.length, 32);
  assert.equal(out.dcrClient, undefined);
});

test('readUserTokensConfig honors overrides for expiry and accepts a dcrClient block', () => {
  const config = makeConfig({
    serviceTokens: {
      userTokens: {
        enabled: false,
        defaultExpiryDays: 7,
        maxExpiryDays: 90,
        encryptionKey: validKeyBase64,
        dcrClient: {
          clientId: 'cid',
          clientSecret: 'csec',
          redirectUri: 'https://example.com/cb',
        },
      },
    },
  });
  const out = readUserTokensConfig(config);
  assert.equal(out.enabled, false);
  assert.equal(out.defaultExpiryDays, 7);
  assert.equal(out.maxExpiryDays, 90);
  assert.deepEqual(out.dcrClient, {
    clientId: 'cid',
    clientSecret: 'csec',
    redirectUri: 'https://example.com/cb',
  });
});

test('readUserTokensConfig rejects defaultExpiryDays > maxExpiryDays', () => {
  const config = makeConfig({
    serviceTokens: {
      userTokens: {
        defaultExpiryDays: 100,
        maxExpiryDays: 30,
        encryptionKey: validKeyBase64,
      },
    },
  });
  assert.throws(() => readUserTokensConfig(config), /defaultExpiryDays/);
});

test('readUserTokensConfig rejects non-positive maxExpiryDays', () => {
  const config = makeConfig({
    serviceTokens: {
      userTokens: {
        maxExpiryDays: 0,
        encryptionKey: validKeyBase64,
      },
    },
  });
  assert.throws(() => readUserTokensConfig(config), /maxExpiryDays/);
});

test('missingAuthBackendFlags returns both flags when neither is set', () => {
  const config = makeConfig({});
  const missing = missingAuthBackendFlags(config);
  assert.deepEqual(missing.sort(), [
    'auth.experimentalDynamicClientRegistration.enabled',
    'auth.experimentalRefreshToken.enabled',
  ]);
});

test('missingAuthBackendFlags returns empty when both flags are true', () => {
  const config = makeConfig({
    auth: {
      experimentalDynamicClientRegistration: { enabled: true },
      experimentalRefreshToken: { enabled: true },
    },
  });
  assert.deepEqual(missingAuthBackendFlags(config), []);
});

test('missingAuthBackendFlags returns the one missing flag', () => {
  const config = makeConfig({
    auth: {
      experimentalDynamicClientRegistration: { enabled: true },
      experimentalRefreshToken: { enabled: false },
    },
  });
  assert.deepEqual(missingAuthBackendFlags(config), [
    'auth.experimentalRefreshToken.enabled',
  ]);
});
