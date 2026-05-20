import test from 'node:test';
import assert from 'node:assert/strict';

import { readServiceTokenAuthConfig } from './config.js';

test('readServiceTokenAuthConfig defaults cache ttl to 60 seconds', () => {
  const config = {
    getOptionalConfig() {
      return undefined;
    },
  };

  assert.deepEqual(readServiceTokenAuthConfig(config), {
    cacheTtlSeconds: 60,
  });
});

test('readServiceTokenAuthConfig reads configured cache ttl seconds', () => {
  const config = {
      getOptionalConfig(key) {
      assert.equal(key, 'accessTokens.service');
      return {
        getOptionalNumber(innerKey) {
          assert.equal(innerKey, 'cacheTtlSeconds');
          return 15;
        },
      };
    },
  };

  assert.deepEqual(readServiceTokenAuthConfig(config), {
    cacheTtlSeconds: 15,
  });
});
