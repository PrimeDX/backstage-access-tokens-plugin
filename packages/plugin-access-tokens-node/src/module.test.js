import test from 'node:test';
import assert from 'node:assert/strict';

import { createRequire } from 'node:module';
import { serviceTokenHandlerType } from './constants.js';
import { serviceAccessTokenHandlerModule } from './module.js';

const require = createRequire(import.meta.url);
const { externalTokenHandlersServiceRef } = require('@backstage/backend-defaults/auth');

test('serviceAccessTokenHandlerModule provides the external token handler service with configured cache ttl', async () => {
  assert.equal(serviceAccessTokenHandlerModule.service.id, externalTokenHandlersServiceRef.id);

  const fakeClient = () => {
    throw new Error('client should not be used during handler creation');
  };

  const handler = await serviceAccessTokenHandlerModule.factory({
    config: {
      getOptionalConfig(key) {
        assert.equal(key, 'accessTokens.service');
        return {
          getOptionalNumber(innerKey) {
            assert.equal(innerKey, 'cacheTtlSeconds');
            return 5;
          },
        };
      },
    },
    lifecycle: {},
    logger: { warn() {} },
  }, {
    forPlugin(pluginId) {
      assert.equal(pluginId, 'access-tokens');
      return {
        async getClient() {
          return fakeClient;
        },
      };
    },
  });

  assert.equal(handler.type, serviceTokenHandlerType);
});
