import test from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryUserTokensDatabase } from './userTokensDatabase.js';
import { createOauthOrchestrator } from './userTokensOauth.js';

function discoveryResponse() {
  return new Response(
    JSON.stringify({
      authorization_endpoint: 'https://example.com/v1/authorize',
      token_endpoint: 'https://example.com/v1/token',
      registration_endpoint: 'https://example.com/v1/register',
      revocation_endpoint: 'https://example.com/v1/revoke',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeFetch(scripted) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.toString(), init });
    const response = scripted.shift();
    if (!response) {
      throw new Error(`Unexpected fetch ${url}`);
    }
    return typeof response === 'function' ? response(url, init) : response;
  };
  return { fetchImpl, calls };
}

test('discoverEndpoints fetches the well-known doc and caches it', async () => {
  const { fetchImpl, calls } = makeFetch([discoveryResponse()]);
  const db = createInMemoryUserTokensDatabase();
  const orch = createOauthOrchestrator({
    db,
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });

  const endpoints = await orch.discoverEndpoints();
  assert.equal(endpoints.tokenEndpoint, 'https://example.com/v1/token');
  assert.equal(endpoints.revocationEndpoint, 'https://example.com/v1/revoke');
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://example.com/api/auth/.well-known/openid-configuration',
  );

  // Second call should be cached
  await orch.discoverEndpoints();
  assert.equal(calls.length, 1);
});

test('discoverEndpoints rejects missing required fields', async () => {
  const incomplete = new Response(
    JSON.stringify({ authorization_endpoint: 'a' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
  const { fetchImpl } = makeFetch([incomplete]);
  const orch = createOauthOrchestrator({
    db: createInMemoryUserTokensDatabase(),
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });
  await assert.rejects(() => orch.discoverEndpoints(), /missing token_endpoint/);
});

test('ensureDcrClient uses the operator-pre-configured client without registering', async () => {
  const { fetchImpl, calls } = makeFetch([]);
  const db = createInMemoryUserTokensDatabase();
  const orch = createOauthOrchestrator({
    db,
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });

  const client = await orch.ensureDcrClient({
    configClient: { clientId: 'cid', clientSecret: 'csec', redirectUri: 'https://e/cb' },
    callbackUrl: 'https://e/cb',
  });

  assert.equal(client.source, 'config');
  assert.equal(client.clientId, 'cid');
  assert.equal(calls.length, 0, 'no fetch should be issued in config mode');
});

test('ensureDcrClient returns cached DCR client if redirectUri matches', async () => {
  const { fetchImpl } = makeFetch([]);
  const db = createInMemoryUserTokensDatabase();
  await db.saveDcrClient({
    id: 'cached',
    clientId: 'cached-id',
    clientSecret: 'cached-secret',
    redirectUri: 'https://example.com/cb',
    source: 'dcr',
  });
  const orch = createOauthOrchestrator({
    db,
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });

  const client = await orch.ensureDcrClient({
    callbackUrl: 'https://example.com/cb',
  });
  assert.equal(client.clientId, 'cached-id');
});

test('ensureDcrClient registers via /register when no cached client', async () => {
  const registrationResponse = new Response(
    JSON.stringify({ client_id: 'new-cid', client_secret: 'new-secret' }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
  const { fetchImpl, calls } = makeFetch([discoveryResponse(), registrationResponse]);
  const db = createInMemoryUserTokensDatabase();
  const orch = createOauthOrchestrator({
    db,
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });

  const client = await orch.ensureDcrClient({
    callbackUrl: 'https://example.com/cb',
  });
  assert.equal(client.clientId, 'new-cid');
  assert.equal(client.source, 'dcr');

  // Persisted in db
  const persisted = await db.getDcrClient();
  assert.equal(persisted.clientId, 'new-cid');

  // Registration call shape
  const regCall = calls[1];
  assert.equal(regCall.url, 'https://example.com/v1/register');
  const regBody = JSON.parse(regCall.init.body);
  assert.deepEqual(regBody.redirect_uris, ['https://example.com/cb']);
  assert.equal(regBody.scope, 'openid offline_access');
});

test('buildAuthorizeUrl returns a URL with all OAuth params and PKCE challenge', async () => {
  const { fetchImpl } = makeFetch([discoveryResponse()]);
  const orch = createOauthOrchestrator({
    db: createInMemoryUserTokensDatabase(),
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });

  const url = await orch.buildAuthorizeUrl({
    clientId: 'cid',
    redirectUri: 'https://example.com/cb',
    state: 'state-abc',
    codeVerifier: 'verifier-deterministic',
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://example.com/v1/authorize');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('client_id'), 'cid');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://example.com/cb');
  assert.equal(parsed.searchParams.get('scope'), 'openid offline_access');
  assert.equal(parsed.searchParams.get('state'), 'state-abc');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(parsed.searchParams.get('code_challenge')?.length ?? 0 > 0);
});

test('exchangeCodeForTokens posts form-encoded body and returns refresh_token', async () => {
  const tokenResponse = new Response(
    JSON.stringify({
      access_token: 'at',
      refresh_token: 'rt-sessionId.tail',
      expires_in: 600,
      token_type: 'Bearer',
      scope: 'openid offline_access',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
  const { fetchImpl, calls } = makeFetch([discoveryResponse(), tokenResponse]);
  const orch = createOauthOrchestrator({
    db: createInMemoryUserTokensDatabase(),
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });

  const tokens = await orch.exchangeCodeForTokens({
    clientId: 'cid',
    clientSecret: 'csec',
    code: 'auth-code',
    redirectUri: 'https://example.com/cb',
    codeVerifier: 'verifier',
  });
  assert.equal(tokens.refreshToken, 'rt-sessionId.tail');
  assert.equal(tokens.expiresIn, 600);

  const tokenCall = calls[1];
  assert.equal(tokenCall.url, 'https://example.com/v1/token');
  assert.equal(
    tokenCall.init.headers['Content-Type'],
    'application/x-www-form-urlencoded',
  );
  const body = new URLSearchParams(tokenCall.init.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code_verifier'), 'verifier');
});

test('exchangeCodeForTokens throws if the upstream omits refresh_token', async () => {
  const tokenResponse = new Response(
    JSON.stringify({ access_token: 'at', expires_in: 60 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
  const { fetchImpl } = makeFetch([discoveryResponse(), tokenResponse]);
  const orch = createOauthOrchestrator({
    db: createInMemoryUserTokensDatabase(),
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });

  await assert.rejects(
    () =>
      orch.exchangeCodeForTokens({
        clientId: 'cid',
        clientSecret: 'csec',
        code: 'auth-code',
        redirectUri: 'https://example.com/cb',
        codeVerifier: 'verifier',
      }),
    /did not include a refresh_token/,
  );
});

test('revokeRefreshToken posts to /revoke and returns true on 200', async () => {
  const revokeResponse = new Response('', { status: 200 });
  const { fetchImpl, calls } = makeFetch([discoveryResponse(), revokeResponse]);
  const orch = createOauthOrchestrator({
    db: createInMemoryUserTokensDatabase(),
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });

  const ok = await orch.revokeRefreshToken({
    clientId: 'cid',
    clientSecret: 'csec',
    refreshToken: 'sessionId.random',
  });
  assert.equal(ok, true);

  const revCall = calls[1];
  assert.equal(revCall.url, 'https://example.com/v1/revoke');
  const body = new URLSearchParams(revCall.init.body);
  assert.equal(body.get('token'), 'sessionId.random');
  assert.equal(body.get('token_type_hint'), 'refresh_token');
});

test('parseSessionId extracts the prefix before the dot', () => {
  const { fetchImpl } = makeFetch([]);
  const orch = createOauthOrchestrator({
    db: createInMemoryUserTokensDatabase(),
    getExternalBaseUrl: async () => 'https://example.com/api/auth',
    fetch: fetchImpl,
  });
  assert.equal(orch.parseSessionId('abc-123.tail-bytes'), 'abc-123');
  assert.equal(orch.parseSessionId('no-dot'), '');
  assert.equal(orch.parseSessionId(''), '');
  assert.equal(orch.parseSessionId(null), '');
});
