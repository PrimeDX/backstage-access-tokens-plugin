import crypto from 'node:crypto';
import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import {
  serviceTokensPermissions,
  serviceTokensReadPermission,
  serviceTokensWritePermission,
  serviceTokensRevokePermission,
  userTokensPermissions,
  userTokensReadPermission,
  userTokensWritePermission,
  userTokensRevokePermission,
} from '@primedx/plugin-service-tokens-node';
import { createKnexServiceTokenDatabase } from './database.js';
import { normalizeGroupEntityRef } from './entityRefs.js';
import { createExpressRouter } from './expressRouter.js';
import { readServiceTokenConfig } from './config.js';
import { applyServiceTokenMigrations } from './migrations.js';
import {
  missingAuthBackendFlags,
  readUserTokensConfig,
} from './userTokensConfig.js';
import { createKnexUserTokensDatabase } from './userTokensDatabase.js';
import { createMintFlowStore } from './userTokensMintFlow.js';
import { createOauthOrchestrator } from './userTokensOauth.js';
import { createUserTokensRouter } from './userTokensRouter.js';

function generateId() {
  return crypto.randomUUID();
}

function createAuthorizeHelper(permissions, permission) {
  return async credentials => {
    const [decision] = await permissions.authorize(
      [{ permission }],
      { credentials },
    );

    return decision.result === 'ALLOW';
  };
}

export const serviceTokensPlugin = createBackendPlugin({
  pluginId: 'service-tokens',
  register(env) {
    env.registerInit({
      deps: {
        auth: coreServices.auth,
        catalog: catalogServiceRef,
        config: coreServices.rootConfig,
        database: coreServices.database,
        discovery: coreServices.discovery,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
      },
      async init({
        auth,
        catalog,
        config,
        database,
        discovery,
        httpAuth,
        httpRouter,
        logger,
        permissions,
        permissionsRegistry,
      }) {
        const serviceTokenConfig = readServiceTokenConfig(config);
        const allowedScopes = serviceTokenConfig.scopeCatalogue.map(scope => scope.id);
        const client = await database.getClient();
        if (!database.migrations?.skip) {
          await applyServiceTokenMigrations(client);
        }
        const db = createKnexServiceTokenDatabase({ client });
        permissionsRegistry.addPermissions(serviceTokensPermissions);

        logger.info('service-tokens backend enabled with granular permission-based authorization');

        httpRouter.use(
          createExpressRouter({
            allowedScopes,
            db,
            defaultTokenLifetimeDays: serviceTokenConfig.defaultTokenLifetimeDays,
            ensureGroupExists: async groupEntityRef => {
              try {
                const normalizedGroupEntityRef = normalizeGroupEntityRef(groupEntityRef);
                if (!normalizedGroupEntityRef) {
                  return false;
                }

                const credentials = await auth.getOwnServiceCredentials();
                const entity = await catalog.getEntityByRef(normalizedGroupEntityRef, { credentials });
                return entity?.kind?.toLocaleLowerCase('en-US') === 'group';
              } catch {
                return false;
              }
            },
            generateAuditId,
            generateId,
            httpAuth,
            authorizeRead: createAuthorizeHelper(permissions, serviceTokensReadPermission),
            authorizeWrite: createAuthorizeHelper(permissions, serviceTokensWritePermission),
            authorizeRevoke: createAuthorizeHelper(permissions, serviceTokensRevokePermission),
            scopeCatalogue: serviceTokenConfig.scopeCatalogue,
            maxTokenLifetimeDays: serviceTokenConfig.maxTokenLifetimeDays,
          }),
        );

        httpRouter.addAuthPolicy({
          path: '/',
          allow: 'user-cookie',
        });
        httpRouter.addAuthPolicy({
          path: '/:id',
          allow: 'user-cookie',
        });
        httpRouter.addAuthPolicy({
          path: '/:id/audit',
          allow: 'user-cookie',
        });
        httpRouter.addAuthPolicy({
          path: '/scopes',
          allow: 'user-cookie',
        });

        // ---- User-tokens capability (optional, gated by config) ----
        await maybeWireUserTokens({
          client,
          config,
          discovery,
          httpAuth,
          httpRouter,
          logger,
          permissions,
          permissionsRegistry,
        });
      },
    });
  },
});

async function maybeWireUserTokens({
  client,
  config,
  discovery,
  httpAuth,
  httpRouter,
  logger,
  permissions,
  permissionsRegistry,
}) {
  let userTokensConfig;
  try {
    userTokensConfig = readUserTokensConfig(config);
  } catch (err) {
    logger.info(
      `user-tokens capability not enabled: ${err.message}`,
    );
    return;
  }
  if (!userTokensConfig.enabled) {
    logger.info('user-tokens capability disabled via serviceTokens.userTokens.enabled: false');
    return;
  }
  const missing = missingAuthBackendFlags(config);
  if (missing.length > 0) {
    logger.warn(
      `user-tokens capability requires auth-backend flags: ${missing.join(', ')}; ` +
        'capability will be skipped',
    );
    return;
  }

  permissionsRegistry.addPermissions(userTokensPermissions);
  const db = createKnexUserTokensDatabase({ client });
  const mintFlowStore = createMintFlowStore();
  const oauth = createOauthOrchestrator({
    db,
    logger,
    getExternalBaseUrl: (plugin) => discovery.getExternalBaseUrl(plugin),
  });

  httpRouter.use(
    createUserTokensRouter({
      db,
      mintFlowStore,
      oauth,
      httpAuth,
      authorizeRead: createAuthorizeHelper(permissions, userTokensReadPermission),
      authorizeWrite: createAuthorizeHelper(permissions, userTokensWritePermission),
      authorizeRevoke: createAuthorizeHelper(permissions, userTokensRevokePermission),
      encryptionKey: userTokensConfig.encryptionKey,
      userTokensConfig,
      getExternalBaseUrl: (plugin) => discovery.getExternalBaseUrl(plugin),
      logger,
    }),
  );

  for (const path of [
    '/personal/tokens/mint',
    '/personal/tokens/mint/callback',
    '/personal/tokens',
    '/personal/tokens/:id',
    '/personal/tokens/:id/audit',
  ]) {
    httpRouter.addAuthPolicy({ path, allow: 'user-cookie' });
  }

  logger.info('user-tokens capability enabled at /api/service-tokens/personal/tokens');
}

function generateAuditId() {
  return crypto.randomUUID();
}

export default serviceTokensPlugin;
