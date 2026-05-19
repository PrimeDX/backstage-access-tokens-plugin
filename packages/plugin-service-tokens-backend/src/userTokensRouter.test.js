import test from 'node:test';
import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { Duplex } from 'node:stream';

import { createInMemoryUserTokensDatabase } from './userTokensDatabase.js';
import { createMintFlowStore } from './userTokensMintFlow.js';
import { encryptRefreshToken } from './userTokensEncryption.js';
import { createUserTokensRouter } from './userTokensRouter.js';

const require = createRequire(import.meta.url);
const express = require('express');

// ---------- harness ----------

function mockHttpAuth() {
  return {
    async credentials(req) {
      const userEntityRef = req.header('x-user-ref');
      if (!userEntityRef) {
        const err = new Error('Unauthorized');
        err.name = 'AuthenticationError';
        throw err;
      }
      return { principal: { type: 'user', userEntityRef } };
    },
  };
}

const userTokensConfig = {
  enabled: true,
  defaultExpiryDays: 30,
  maxExpiryDays: 365,
  dcrClient: undefined,
  appBaseUrl: 'https://frontend.example.com',
};

function makeOauthMock(overrides = {}) {
  return {
    async ensureDcrClient() {
      return {
        clientId: 'cid',
        clientSecret: 'csec',
        redirectUri: 'https://example/cb',
        source: 'config',
      };
    },
    async buildAuthorizeUrl({ state }) {
      return `https://example/v1/authorize?state=${encodeURIComponent(state)}`;
    },
    async exchangeCodeForTokens() {
      return {
        accessToken: 'at',
        refreshToken: 'sess-1.long-random',
        expiresIn: 600,
        tokenType: 'Bearer',
        scope: 'openid offline_access',
      };
    },
    async revokeRefreshToken() {
      return true;
    },
    parseSessionId(token) {
      const i = token.indexOf('.');
      return i > 0 ? token.slice(0, i) : '';
    },
    ...overrides,
  };
}

function makeRouter(overrides = {}) {
  const db = overrides.db ?? createInMemoryUserTokensDatabase();
  const mintFlowStore = overrides.mintFlowStore ?? createMintFlowStore();
  const oauth = overrides.oauth ?? makeOauthMock();
  const encryptionKey = overrides.encryptionKey ?? randomBytes(32);

  const authorizeRead = overrides.authorizeRead ?? (async () => true);
  const authorizeWrite = overrides.authorizeWrite ?? (async () => true);
  const authorizeRevoke = overrides.authorizeRevoke ?? (async () => true);

  let idCounter = 0;
  const generateId = overrides.generateId ?? (() => `id-${++idCounter}`);

  const router = createUserTokensRouter({
    db,
    mintFlowStore,
    oauth,
    httpAuth: mockHttpAuth(),
    authorizeRead,
    authorizeWrite,
    authorizeRevoke,
    encryptionKey,
    userTokensConfig,
    getExternalBaseUrl: async () => 'https://example/api/service-tokens',
    generateId,
    now: overrides.now,
  });

  const app = express();
  app.use('/api/service-tokens', router);

  return { app, db, mintFlowStore, oauth, encryptionKey };
}

async function requestJson(app, method, path, options = {}) {
  const headers = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );

  const socket = new Duplex({
    read() {},
    write(_c, _e, cb) { cb(); },
  });
  socket.remoteAddress = '127.0.0.1';

  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = `/api/service-tokens${path}`;
  req.headers = headers;
  req.body = options.body;

  const res = new ServerResponse(req);
  res.assignSocket(socket);

  const chunks = [];
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  res.write = function (chunk, enc, cb) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
    return origWrite(chunk, enc, cb);
  };
  res.end = function (chunk, enc, cb) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
    return origEnd(chunk, enc, cb);
  };

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out ${method} ${path}`)), 2000);
    res.on('finish', () => { clearTimeout(timeout); resolve(); });
    res.on('error', err => { clearTimeout(timeout); reject(err); });
    app.handle(req, res, reject);
    req.push(null);
  });

  const text = Buffer.concat(chunks).toString('utf8');
  const contentType = res.getHeader('content-type') || '';
  return {
    status: res.statusCode,
    headers: {
      location: res.getHeader('location'),
      'content-type': contentType,
    },
    body: text && String(contentType).includes('application/json') ? JSON.parse(text) : text,
  };
}

// ---------- tests ----------

test('POST /personal/tokens/mint without session returns 401', async () => {
  const { app } = makeRouter();
  const r = await requestJson(app, 'POST', '/personal/tokens/mint', {
    body: { name: 'a' },
  });
  assert.equal(r.status, 401);
});

test('POST /personal/tokens/mint without write permission returns 403', async () => {
  const { app } = makeRouter({ authorizeWrite: async () => false });
  const r = await requestJson(app, 'POST', '/personal/tokens/mint', {
    headers: { 'x-user-ref': 'user:default/alice' },
    body: { name: 'a' },
  });
  assert.equal(r.status, 403);
});

test('POST /personal/tokens/mint rejects missing name', async () => {
  const { app } = makeRouter();
  const r = await requestJson(app, 'POST', '/personal/tokens/mint', {
    headers: { 'x-user-ref': 'user:default/alice' },
    body: {},
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /name is required/);
});

test('POST /personal/tokens/mint rejects expiresAt in the past', async () => {
  const { app } = makeRouter({ now: () => new Date('2026-05-19T12:00:00Z') });
  const r = await requestJson(app, 'POST', '/personal/tokens/mint', {
    headers: { 'x-user-ref': 'user:default/alice' },
    body: { name: 'a', expiresAt: '2026-01-01T00:00:00Z' },
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /in the future/);
});

test('POST /personal/tokens/mint rejects duplicate name for the same user', async () => {
  const { app, db } = makeRouter();
  await db.createUserToken({
    id: 'pre',
    name: 'my-ci',
    userEntityRef: 'user:default/alice',
    prefix: 'aaaaaaaa',
    sessionId: 's',
    encryptedToken: Buffer.from('x'),
    encryptedTokenIv: Buffer.from('iv'),
    encryptedTokenTag: Buffer.from('tag'),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const r = await requestJson(app, 'POST', '/personal/tokens/mint', {
    headers: { 'x-user-ref': 'user:default/alice' },
    body: { name: 'my-ci' },
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /already exists/);
});

test('POST /personal/tokens/mint happy path returns flowId, state and authorizeUrl', async () => {
  const { app, mintFlowStore } = makeRouter();
  const r = await requestJson(app, 'POST', '/personal/tokens/mint', {
    headers: { 'x-user-ref': 'user:default/alice' },
    body: { name: 'ci' },
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.flowId);
  assert.ok(r.body.state);
  assert.match(r.body.authorizeUrl, /^https:\/\/example\/v1\/authorize\?state=/);
  assert.equal(mintFlowStore.size(), 1);
});

test('GET /personal/tokens/mint/callback rejects unknown state', async () => {
  const { app } = makeRouter();
  const r = await requestJson(app, 'GET', '/personal/tokens/mint/callback?code=c&state=unknown');
  assert.equal(r.status, 400);
});

test('GET /personal/tokens/mint/callback happy path inserts row + audit, returns HTML with token', async () => {
  const { app, mintFlowStore, db } = makeRouter();
  // Pre-populate an in-flight entry as if /mint had been called
  const created = mintFlowStore.create({
    userEntityRef: 'user:default/alice',
    name: 'ci',
  });
  const r = await requestJson(
    app,
    'GET',
    `/personal/tokens/mint/callback?code=AUTHCODE&state=${encodeURIComponent(created.state)}`,
  );
  // Callback now redirects to the frontend with payload in URL fragment.
  assert.equal(r.status, 302);
  const location = r.headers?.location;
  assert.match(
    location,
    new RegExp(
      `^https://frontend\\.example\\.com/settings/personal-tokens#user-tokens-mint=`,
    ),
  );
  const encoded = location.split('#user-tokens-mint=')[1];
  const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  assert.equal(decoded.type, 'user-tokens-mint-result');
  assert.equal(decoded.token, 'sess-1.long-random');
  assert.equal(decoded.metadata.name, 'ci');

  // DB row exists
  const tokens = await db.listUserTokensForUser('user:default/alice');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].name, 'ci');
  assert.equal(tokens[0].prefix, 'sess-1.l'.slice(0, 8));

  // Audit event emitted
  const audit = await db.getUserAuditLog(tokens[0].id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].event, 'MINTED');
});

test('GET /personal/tokens lists only the caller\'s tokens', async () => {
  const { app, db } = makeRouter();
  await db.createUserToken({
    id: 't1',
    name: 'mine',
    userEntityRef: 'user:default/alice',
    prefix: 'a',
    sessionId: 's1',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await db.createUserToken({
    id: 't2',
    name: 'others',
    userEntityRef: 'user:default/bob',
    prefix: 'b',
    sessionId: 's2',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const r = await requestJson(app, 'GET', '/personal/tokens', {
    headers: { 'x-user-ref': 'user:default/alice' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.tokens.length, 1);
  assert.equal(r.body.tokens[0].name, 'mine');
});

test('GET /personal/tokens/:id returns 404 for another user\'s id', async () => {
  const { app, db } = makeRouter();
  await db.createUserToken({
    id: 't1',
    name: 'alice-token',
    userEntityRef: 'user:default/alice',
    prefix: 'a',
    sessionId: 's1',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const r = await requestJson(app, 'GET', '/personal/tokens/t1', {
    headers: { 'x-user-ref': 'user:default/bob' },
  });
  assert.equal(r.status, 404);
});

test('DELETE /personal/tokens/:id revokes via oauth and wipes ciphertext', async () => {
  // Pre-mint a token whose ciphertext we can decrypt
  const encryptionKey = randomBytes(32);
  const { ciphertext, iv, tag } = encryptRefreshToken(encryptionKey, 'sess-1.real-token');
  const db = createInMemoryUserTokensDatabase();
  await db.createUserToken({
    id: 't1',
    name: 'to-revoke',
    userEntityRef: 'user:default/alice',
    prefix: 'sess-1.r'.slice(0, 8),
    sessionId: 'sess-1',
    encryptedToken: ciphertext,
    encryptedTokenIv: iv,
    encryptedTokenTag: tag,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  let revokedWithToken = null;
  const oauth = makeOauthMock({
    async revokeRefreshToken({ refreshToken }) {
      revokedWithToken = refreshToken;
      return true;
    },
  });
  const { app } = makeRouter({ db, oauth, encryptionKey });

  const r = await requestJson(app, 'DELETE', '/personal/tokens/t1', {
    headers: { 'x-user-ref': 'user:default/alice' },
  });
  assert.equal(r.status, 204);
  assert.equal(revokedWithToken, 'sess-1.real-token');

  const after = await db.getUserTokenForUser('t1', 'user:default/alice');
  assert.notEqual(after.revokedAt, null);
  assert.equal(after.encryptedToken, null);
  assert.equal(after.encryptedTokenIv, null);
  assert.equal(after.encryptedTokenTag, null);

  const audit = await db.getUserAuditLog('t1');
  assert.equal(audit[0].event, 'REVOKED');
});

test('DELETE /personal/tokens/:id is idempotent on already-revoked tokens', async () => {
  const db = createInMemoryUserTokensDatabase();
  await db.createUserToken({
    id: 't1',
    name: 'gone',
    userEntityRef: 'user:default/alice',
    prefix: 'a',
    sessionId: 's',
    encryptedToken: null,
    encryptedTokenIv: null,
    encryptedTokenTag: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: new Date(),
  });
  const { app } = makeRouter({ db });
  const r = await requestJson(app, 'DELETE', '/personal/tokens/t1', {
    headers: { 'x-user-ref': 'user:default/alice' },
  });
  assert.equal(r.status, 204);
});

test('DELETE /personal/tokens/:id returns 502 when oauth revoke rejects', async () => {
  const encryptionKey = randomBytes(32);
  const { ciphertext, iv, tag } = encryptRefreshToken(encryptionKey, 'sess-1.token');
  const db = createInMemoryUserTokensDatabase();
  await db.createUserToken({
    id: 't1',
    name: 'flaky',
    userEntityRef: 'user:default/alice',
    prefix: 'a',
    sessionId: 'sess-1',
    encryptedToken: ciphertext,
    encryptedTokenIv: iv,
    encryptedTokenTag: tag,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const oauth = makeOauthMock({ async revokeRefreshToken() { return false; } });
  const { app } = makeRouter({ db, oauth, encryptionKey });
  const r = await requestJson(app, 'DELETE', '/personal/tokens/t1', {
    headers: { 'x-user-ref': 'user:default/alice' },
  });
  assert.equal(r.status, 502);

  // Row not changed
  const after = await db.getUserTokenForUser('t1', 'user:default/alice');
  assert.ok(!after.revokedAt, 'revokedAt should remain unset');
  assert.notEqual(after.encryptedToken, null);
});

test('GET /personal/tokens/:id/audit returns events newest-first', async () => {
  const db = createInMemoryUserTokensDatabase();
  await db.createUserToken({
    id: 't1',
    name: 'a',
    userEntityRef: 'user:default/alice',
    prefix: 'a',
    sessionId: 's',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await db.appendUserAuditEvent({
    id: 'e1',
    tokenId: 't1',
    event: 'MINTED',
    actor: 'user:default/alice',
    metadata: null,
    occurredAt: new Date('2026-05-01T00:00:00Z'),
  });
  await db.appendUserAuditEvent({
    id: 'e2',
    tokenId: 't1',
    event: 'REVOKED',
    actor: 'user:default/alice',
    metadata: null,
    occurredAt: new Date('2026-05-02T00:00:00Z'),
  });

  const { app } = makeRouter({ db });
  const r = await requestJson(app, 'GET', '/personal/tokens/t1/audit', {
    headers: { 'x-user-ref': 'user:default/alice' },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.body.events.map(e => e.id),
    ['e2', 'e1'],
  );
});
