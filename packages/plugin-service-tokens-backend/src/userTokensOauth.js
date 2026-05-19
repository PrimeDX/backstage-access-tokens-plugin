import { randomUUID } from 'node:crypto';

import { deriveCodeChallenge } from './userTokensMintFlow.js';

/**
 * OAuth orchestration helper that lets the user-tokens capability obtain
 * Backstage refresh tokens via the standard RFC 6749 / RFC 7591 / RFC 7009
 * flows exposed by `@backstage/plugin-auth-backend` when DCR is enabled.
 *
 * No bearer-token type is invented; the plugin simply orchestrates the
 * existing OAuth pipeline. See docs/spec/user-tokens-architecture.md §1.
 *
 * Hard requirements (validated elsewhere in the plugin):
 *   - `auth.experimentalDynamicClientRegistration.enabled: true`
 *   - `auth.experimentalRefreshToken.enabled: true`
 *
 * This module is HTTP-side glue; persistence is delegated to the database
 * (for the DCR client cache) and the mint-flow store (for in-flight state).
 */

const DEFAULT_SCOPES = 'openid offline_access';
const DEFAULT_GRANT_TYPES = ['authorization_code'];
const DEFAULT_RESPONSE_TYPES = ['code'];

/**
 * Build an OAuth orchestrator bound to a Backstage origin.
 *
 * @param {object} deps
 * @param {object} deps.db                 user-tokens database (for DCR cache)
 * @param {object} deps.logger
 * @param {(target: string) => Promise<string>} deps.getExternalBaseUrl
 *   Resolver returning the publicly accessible base URL for a given plugin
 *   id. The orchestrator uses `getExternalBaseUrl('auth')` to find the
 *   auth-backend origin and reach `/.well-known/openid-configuration`.
 * @param {typeof fetch} [deps.fetch]      Override for tests.
 * @param {() => Date} [deps.now]
 */
export function createOauthOrchestrator(deps) {
  const { db, logger, getExternalBaseUrl } = deps;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? (() => new Date());

  if (typeof fetchImpl !== 'function') {
    throw new Error('createOauthOrchestrator requires globalThis.fetch or a deps.fetch override');
  }

  let cachedDiscovery = null;

  async function discoverEndpoints() {
    if (cachedDiscovery) return cachedDiscovery;

    const authBaseUrl = await getExternalBaseUrl('auth');
    // Backstage publishes its OAuth/OIDC server metadata at the auth
    // plugin's own namespace (e.g. http://host/api/auth/.well-known/
    // openid-configuration), NOT at the origin's root. The doc includes
    // `authorization_endpoint`, `token_endpoint`, `registration_endpoint`
    // (when DCR is enabled), and `revocation_endpoint` as fully-qualified
    // URLs — this orchestrator uses them as-is.
    const docUrl = `${authBaseUrl}/.well-known/openid-configuration`;

    const response = await fetchImpl(docUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(
        `Failed to load OAuth discovery document at ${docUrl}: HTTP ${response.status}`,
      );
    }
    const doc = await response.json();

    for (const required of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) {
      if (typeof doc[required] !== 'string') {
        throw new Error(`OAuth discovery document is missing ${required}`);
      }
    }

    cachedDiscovery = {
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      registrationEndpoint: doc.registration_endpoint,
      revocationEndpoint: doc.revocation_endpoint,
    };
    return cachedDiscovery;
  }

  /**
   * Ensure a DCR client is registered (or use the operator-pre-configured
   * one if `configClient` is provided). Returns the cached or newly-saved
   * client credentials.
   */
  async function ensureDcrClient(input) {
    const { configClient, callbackUrl } = input;

    if (configClient) {
      return {
        clientId: configClient.clientId,
        clientSecret: configClient.clientSecret,
        redirectUri: configClient.redirectUri,
        source: 'config',
      };
    }

    const existing = await db.getDcrClient();
    if (existing && existing.redirectUri === callbackUrl) {
      return existing;
    }

    const { registrationEndpoint } = await discoverEndpoints();
    const response = await fetchImpl(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_name: 'backstage-service-token-plugin (user-tokens)',
        redirect_uris: [callbackUrl],
        grant_types: DEFAULT_GRANT_TYPES,
        response_types: DEFAULT_RESPONSE_TYPES,
        scope: DEFAULT_SCOPES,
        token_endpoint_auth_method: 'client_secret_post',
      }),
    });

    if (!response.ok) {
      const body = await safeText(response);
      throw new Error(
        `Dynamic client registration failed: HTTP ${response.status}: ${body}`,
      );
    }

    const reg = await response.json();
    if (typeof reg.client_id !== 'string' || typeof reg.client_secret !== 'string') {
      throw new Error('Dynamic client registration response missing client_id or client_secret');
    }

    const record = {
      id: randomUUID(),
      clientId: reg.client_id,
      clientSecret: reg.client_secret,
      redirectUri: callbackUrl,
      source: 'dcr',
      createdAt: now(),
    };
    await db.saveDcrClient(record);
    logger?.info?.('Registered DCR client for user-tokens', {
      clientId: record.clientId,
    });
    return record;
  }

  /**
   * Build the authorization URL the user's browser should navigate to in
   * order to begin the consent flow.
   */
  async function buildAuthorizeUrl({ clientId, redirectUri, state, codeVerifier }) {
    const { authorizationEndpoint } = await discoverEndpoints();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: DEFAULT_SCOPES,
      state,
      code_challenge: deriveCodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    const sep = authorizationEndpoint.includes('?') ? '&' : '?';
    return `${authorizationEndpoint}${sep}${params.toString()}`;
  }

  /**
   * Exchange an authorization code for the {accessToken, refreshToken, ...}
   * pair. Throws on any non-2xx with the upstream body for diagnostics.
   */
  async function exchangeCodeForTokens({
    clientId,
    clientSecret,
    code,
    redirectUri,
    codeVerifier,
  }) {
    const { tokenEndpoint } = await discoverEndpoints();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    const response = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    if (!response.ok) {
      const detail = await safeText(response);
      throw new Error(`Token exchange failed: HTTP ${response.status}: ${detail}`);
    }
    const data = await response.json();
    if (typeof data.refresh_token !== 'string') {
      throw new Error('Token endpoint response did not include a refresh_token');
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Revoke a previously-issued refresh token via RFC 7009 /v1/revoke.
   * Returns true on 200 (server accepted), false on any non-2xx.
   */
  async function revokeRefreshToken({ clientId, clientSecret, refreshToken }) {
    const { revocationEndpoint } = await discoverEndpoints();
    if (!revocationEndpoint) {
      throw new Error('OAuth discovery document did not advertise a revocation_endpoint');
    }
    const body = new URLSearchParams({
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
    });
    const response = await fetchImpl(revocationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return response.ok;
  }

  /**
   * Extract the auth-backend session ID from a raw refresh token, which is
   * encoded as `<sessionId>.<random>` per R4 in the research notes.
   * Returns the empty string if the format is unexpected.
   */
  function parseSessionId(refreshToken) {
    if (typeof refreshToken !== 'string') return '';
    const dot = refreshToken.indexOf('.');
    if (dot <= 0) return '';
    return refreshToken.slice(0, dot);
  }

  return {
    discoverEndpoints,
    ensureDcrClient,
    buildAuthorizeUrl,
    exchangeCodeForTokens,
    revokeRefreshToken,
    parseSessionId,
    _resetCacheForTests() {
      cachedDiscovery = null;
    },
  };
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
