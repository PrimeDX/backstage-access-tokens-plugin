import crypto from 'node:crypto';
import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { serviceTokensAdminPermission } from '@adriandantas/plugin-service-tokens-node';
import { createKnexServiceTokenDatabase } from './database.js';
import { normalizeGroupEntityRef } from './entityRefs.js';
import { createExpressRouter } from './expressRouter.js';
import { readServiceTokenConfig } from './config.js';
import { applyServiceTokenMigrations } from './migrations.js';

function generateId() {
  return crypto.randomUUID();
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
        permissionsRegistry.addPermissions([serviceTokensAdminPermission]);

        logger.info('service-tokens backend enabled with permission-based admin authorization');

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
            authorizeAdminAccess: async ({ credentials }) => {
              const [decision] = await permissions.authorize(
                [{ permission: serviceTokensAdminPermission }],
                { credentials },
              );

              return decision.result === 'ALLOW';
            },
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
      },
    });
  },
});

function generateAuditId() {
  return crypto.randomUUID();
}

export default serviceTokensPlugin;
