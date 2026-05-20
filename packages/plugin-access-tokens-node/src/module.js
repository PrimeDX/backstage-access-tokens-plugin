import { createRequire } from 'node:module';
import path from 'node:path';
import { createTokenCache } from './cache.js';
import { readServiceTokenAuthConfig } from './config.js';
import { createServiceTokenAuthDatabase } from './database.js';
import { createScopeResolver } from './resolveTokenScopes.js';
import { createServiceTokenHandler } from './serviceTokenHandler.js';

/**
 * Module-level scope resolver, initialized when the service factory runs.
 * Use `getServiceTokenScopeResolver()` to access it after backend startup.
 */
let _scopeResolver = null;

/**
 * Returns the scope resolver bound to the service token verification cache.
 *
 * Call this after the Backstage backend has started (i.e., after the
 * serviceAccessTokenHandlerModule factory has run). Returns a function that
 * accepts a raw token string and returns its granted scopes.
 *
 * @returns {((rawToken: string) => string[]) | null} The resolver, or null
 *   if the module has not been initialized yet.
 */
export function getServiceTokenScopeResolver() {
  return _scopeResolver;
}

const require = createRequire(import.meta.url);
const { createServiceFactory, coreServices } = require('@backstage/backend-plugin-api');
const { externalTokenHandlersServiceRef } = require('@backstage/backend-defaults/auth');
const backstageDefaultsPackagePath = require.resolve('@backstage/backend-defaults/package.json');
const {
  DatabaseManager,
} = require(
  path.join(
    path.dirname(backstageDefaultsPackagePath),
    'dist/entrypoints/database/DatabaseManager.cjs.js',
  ),
);

export const serviceAccessTokenHandlerModule = createServiceFactory({
  service: externalTokenHandlersServiceRef,
  deps: {
    config: coreServices.rootConfig,
    lifecycle: coreServices.lifecycle,
    logger: coreServices.logger,
    rootLifecycle: coreServices.rootLifecycle,
    rootLogger: coreServices.rootLogger,
  },
  createRootContext({ config, rootLifecycle, rootLogger }) {
    return DatabaseManager.fromConfig(config, { rootLifecycle, rootLogger });
  },
  async factory({ config, lifecycle, logger }, databaseManager) {
    const authConfig = readServiceTokenAuthConfig(config);
    const database = databaseManager.forPlugin('access-tokens', { lifecycle, logger });
    const client = await database.getClient();
    const db = createServiceTokenAuthDatabase({ client });
    const cache = createTokenCache({ ttlSeconds: authConfig.cacheTtlSeconds });
    _scopeResolver = createScopeResolver(cache);

    return createServiceTokenHandler({
      cache,
      db,
      logger,
    });
  },
});

export default serviceAccessTokenHandlerModule;
