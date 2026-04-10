const DEFAULT_CACHE_TTL_SECONDS = 60;

export function readServiceTokenAuthConfig(config) {
  const serviceTokens = config?.getOptionalConfig?.('serviceTokens');

  return {
    cacheTtlSeconds:
      serviceTokens?.getOptionalNumber?.('cacheTtlSeconds') ?? DEFAULT_CACHE_TTL_SECONDS,
  };
}
