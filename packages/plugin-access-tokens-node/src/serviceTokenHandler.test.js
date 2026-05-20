import test from 'node:test';
import assert from 'node:assert/strict';

import { createTokenCache } from './cache.js';
import { serviceTokenHandlerType } from './constants.js';
import { sha256hex } from './primitives.js';
import { createServiceTokenHandler } from './serviceTokenHandler.js';

test('createServiceTokenHandler exposes the configured token type', () => {
  const handler = createServiceTokenHandler({
    cache: createTokenCache({ ttlSeconds: 60 }),
    db: {
      async findActiveToken() {
        return null;
      },
      async updateLastUsed() {},
    },
    logger: { warn() {} },
  });

  assert.equal(handler.type, serviceTokenHandlerType);
});

test('createServiceTokenHandler verifies tokens and populates the cache', async () => {
  const token = 'bsat_handler-token';
  const tokenHash = sha256hex(token);
  const cache = createTokenCache({ ttlSeconds: 60 });
  let dbCalls = 0;

  const handler = createServiceTokenHandler({
    cache,
    db: {
      async findActiveToken(hash) {
        dbCalls += 1;
        assert.equal(hash, tokenHash);
        return {
          id: 'token-1',
          groupEntityRef: 'group:default/platform-team',
          name: 'deploy-bot',
        };
      },
      async updateLastUsed() {},
    },
    logger: { warn() {} },
  });

  const context = handler.initialize({ options: {} });
  const first = await handler.verifyToken(token, context);
  const second = await handler.verifyToken(token, context);

  assert.deepEqual(first, {
    subject: 'service-token:group:default/platform-team:deploy-bot',
    scopes: [],
  });
  assert.deepEqual(second, first);
  assert.equal(dbCalls, 1);
});

test('service token handler type matches the required external access config value', () => {
  assert.equal(serviceTokenHandlerType, 'backstage-service-access-token');
});
