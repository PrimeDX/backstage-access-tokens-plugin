import { getScopeCatalogue } from './scopes.js';

const DEFAULT_ADMINS = ['user:development/guest'];

export function readServiceTokenConfig(config) {
  const serviceTokens = config?.getOptionalConfig?.('accessTokens.service');
  const admins =
    serviceTokens?.getOptionalStringArray?.('admin.userEntityRefs') ?? DEFAULT_ADMINS;
  const maxTokenLifetimeDays =
    serviceTokens?.getOptionalNumber?.('maxTokenLifetimeDays') ?? 365;
  const defaultTokenLifetimeDays =
    serviceTokens?.getOptionalNumber?.('defaultTokenLifetimeDays') ?? maxTokenLifetimeDays;
  const configuredScopes =
    serviceTokens?.getOptionalConfigArray?.('scopes')?.map(scopeConfig => ({
      id: scopeConfig.getString('id'),
      description: scopeConfig.getString('description'),
      plugin: scopeConfig.getString('plugin'),
    })) ?? [];

  return {
    adminUserEntityRefs: admins,
    defaultTokenLifetimeDays,
    maxTokenLifetimeDays,
    scopeCatalogue: getScopeCatalogue(configuredScopes),
  };
}
