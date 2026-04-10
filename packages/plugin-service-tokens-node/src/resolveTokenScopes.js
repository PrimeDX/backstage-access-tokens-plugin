import { sha256hex } from './primitives.js';

/**
 * Creates a scope resolver that reads token scopes from the verification cache.
 *
 * The resolver hashes the raw token and looks up the cached entry that was
 * populated during token verification. This means:
 * - Zero additional database queries — scopes are already cached.
 * - The token must have been verified (i.e., the request passed through
 *   Backstage's auth layer) before calling the resolver.
 * - Cache TTL applies — after expiry, the next verification re-populates it.
 *
 * @param {object} cache - The token cache instance (from createTokenCache).
 * @returns {function(string): string[]} A function that accepts a raw token
 *   and returns its granted scopes, or an empty array if not cached.
 */
export function createScopeResolver(cache) {
  return function resolveTokenScopes(rawToken) {
    if (!rawToken) {
      return [];
    }
    const hash = sha256hex(rawToken);
    const entry = cache.get(hash);
    return entry?.scopes ?? [];
  };
}
