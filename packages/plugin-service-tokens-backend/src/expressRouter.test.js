import test from 'node:test';
import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { Duplex } from 'node:stream';

import { createKnexServiceTokenDatabase } from './database.js';
import { createExpressRouter } from './expressRouter.js';
import { applyServiceTokenMigrations } from './migrations.js';
import { createSqliteClient } from './sqliteTestUtils.js';

const require = createRequire(import.meta.url);
const express = require('express');

function createMockHttpAuth(adminRef = 'user:default/admin') {
  return {
    async credentials(req) {
      const userEntityRef = req.header('x-user-ref');
      if (!userEntityRef) {
        const error = new Error('Unauthorized');
        error.name = 'AuthenticationError';
        throw error;
      }

      return {
        principal: {
          type: 'user',
          userEntityRef,
        },
      };
    },
  };
}

function createFullAdminAuthorizers(adminRef = 'user:default/admin') {
  return {
    authorizeRead(credentials) {
      return credentials.principal.userEntityRef === adminRef;
    },
    authorizeWrite(credentials) {
      return credentials.principal.userEntityRef === adminRef;
    },
    authorizeRevoke(credentials) {
      return credentials.principal.userEntityRef === adminRef;
    },
  };
}

test('express router enforces auth and admin access', async () => {
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);
    const db = createKnexServiceTokenDatabase({ client });
    const app = createApp(
      createExpressRouter({
        allowedScopes: ['catalog:read'],
        db,
        ensureGroupExists: async () => true,
        generateAuditId: () => 'audit-1',
        generateId: () => 'token-1',
        httpAuth: createMockHttpAuth(),
        ...createFullAdminAuthorizers(),
        maxTokenLifetimeDays: 365,
        scopeCatalogue: [{ id: 'catalog:read', title: 'Catalog read' }],
      }),
    );

    const unauthorized = await requestJson(app, 'GET', '/');
      assert.equal(unauthorized.status, 401);
      assert.deepEqual(unauthorized.body, { error: 'Unauthorized' });

      const forbidden = await requestJson(app, 'GET', '/', {
        headers: { 'x-user-ref': 'user:default/alice' },
      });
      assert.equal(forbidden.status, 403);
      assert.deepEqual(forbidden.body, { error: 'Forbidden: read access required' });
  } finally {
    await client.destroy();
  }
});

test('express router persists and serves token lifecycle through the real sqlite database', async () => {
  let now = new Date('2026-04-04T12:00:00.000Z');
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);
    const db = createKnexServiceTokenDatabase({
      client,
      now: () => now,
    });

    const app = createApp(
      createExpressRouter({
        allowedScopes: ['catalog:read', 'techdocs:read'],
        db,
        defaultTokenLifetimeDays: 30,
        ensureGroupExists: async groupEntityRef => groupEntityRef === 'group:default/platform-team',
        generateAuditId: (() => {
          let index = 0;
          return () => `audit-${++index}`;
        })(),
        generateId: () => 'token-1',
        generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
        httpAuth: createMockHttpAuth(),
        ...createFullAdminAuthorizers(),
        maxTokenLifetimeDays: 365,
        now: () => now,
        scopeCatalogue: [
          { id: 'catalog:read', title: 'Catalog read' },
          { id: 'techdocs:read', title: 'TechDocs read' },
        ],
      }),
    );

      const scopes = await requestJson(app, 'GET', '/scopes', {
        headers: { 'x-user-ref': 'user:default/admin' },
      });
      assert.equal(scopes.status, 200);
      assert.deepEqual(scopes.body, {
        scopes: [
          { id: 'catalog:read', title: 'Catalog read' },
          { id: 'techdocs:read', title: 'TechDocs read' },
        ],
      });

      const created = await requestJson(app, 'POST', '/', {
        headers: { 'x-user-ref': 'user:default/admin' },
        body: {
          name: 'cicd-pipeline',
          description: 'Used by CI to read the catalog during deploys.',
          groupEntityRef: 'group:default/platform-team',
          scopes: ['catalog:read'],
          expiresAt: '2026-06-10T00:00:00.000Z',
        },
      });

      assert.equal(created.status, 201);
      assert.equal(created.body.token.id, 'token-1');
      assert.equal(created.body.token.status, 'active');
      assert.equal(created.body.rawToken, 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu');

      const listed = await requestJson(app, 'GET', '/?limit=10&offset=0', {
        headers: { 'x-user-ref': 'user:default/admin' },
      });
      assert.equal(listed.status, 200);
      assert.equal(listed.body.total, 1);
      assert.equal(listed.body.tokens[0].id, 'token-1');
      assert.equal(listed.body.tokens[0].status, 'active');

      const fetched = await requestJson(app, 'GET', '/token-1', {
        headers: { 'x-user-ref': 'user:default/admin' },
      });
      assert.equal(fetched.status, 200);
      assert.equal(fetched.body.id, 'token-1');
      assert.equal(fetched.body.groupEntityRef, 'group:default/platform-team');

      const createdAudit = await requestJson(app, 'GET', '/token-1/audit', {
        headers: { 'x-user-ref': 'user:default/admin' },
      });
      assert.equal(createdAudit.status, 200);
      assert.deepEqual(createdAudit.body.events.map(event => event.event), ['created']);

      now = new Date('2026-04-04T12:05:00.000Z');
      const revoked = await requestJson(app, 'DELETE', '/token-1', {
        headers: { 'x-user-ref': 'user:default/admin' },
        body: { reason: 'rotation' },
      });
      assert.equal(revoked.status, 204);
      assert.equal(revoked.body, undefined);

      const revokedToken = await requestJson(app, 'GET', '/token-1', {
        headers: { 'x-user-ref': 'user:default/admin' },
      });
      assert.equal(revokedToken.status, 200);
      assert.equal(revokedToken.body.status, 'revoked');
      assert.equal(revokedToken.body.revokedBy, 'user:default/admin');

      const revokedOnly = await requestJson(app, 'GET', '/?status=revoked', {
        headers: { 'x-user-ref': 'user:default/admin' },
      });
      assert.equal(revokedOnly.status, 200);
      assert.equal(revokedOnly.body.total, 1);
      assert.equal(revokedOnly.body.tokens[0].status, 'revoked');

      const finalAudit = await requestJson(app, 'GET', '/token-1/audit', {
        headers: { 'x-user-ref': 'user:default/admin' },
      });
      assert.equal(finalAudit.status, 200);
      assert.deepEqual(finalAudit.body.events.map(event => event.event), ['revoked', 'created']);
      assert.deepEqual(finalAudit.body.events[0].metadata, { reason: 'rotation' });
  } finally {
    await client.destroy();
  }
});

test('express router enforces granular permissions — read-only user cannot create or revoke', async () => {
  let now = new Date('2026-04-04T12:00:00.000Z');
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);
    const db = createKnexServiceTokenDatabase({ client, now: () => now });

    const app = createApp(
      createExpressRouter({
        allowedScopes: ['catalog:read'],
        db,
        defaultTokenLifetimeDays: 30,
        ensureGroupExists: async () => true,
        generateAuditId: () => 'audit-1',
        generateId: () => 'token-1',
        generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
        httpAuth: createMockHttpAuth(),
        // Read-only user: can read but not write or revoke
        authorizeRead(credentials) {
          return credentials.principal.userEntityRef === 'user:default/auditor';
        },
        authorizeWrite() {
          return false;
        },
        authorizeRevoke() {
          return false;
        },
        maxTokenLifetimeDays: 365,
        now: () => now,
        scopeCatalogue: [{ id: 'catalog:read', title: 'Catalog read' }],
      }),
    );

    // Read-only user can list tokens
    const listed = await requestJson(app, 'GET', '/', {
      headers: { 'x-user-ref': 'user:default/auditor' },
    });
    assert.equal(listed.status, 200);

    // Read-only user can list scopes
    const scopes = await requestJson(app, 'GET', '/scopes', {
      headers: { 'x-user-ref': 'user:default/auditor' },
    });
    assert.equal(scopes.status, 200);

    // Read-only user cannot create tokens
    const createAttempt = await requestJson(app, 'POST', '/', {
      headers: { 'x-user-ref': 'user:default/auditor' },
      body: {
        name: 'should-fail',
        description: 'Test',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        expiresAt: '2026-06-10T00:00:00.000Z',
      },
    });
    assert.equal(createAttempt.status, 403);
    assert.deepEqual(createAttempt.body, { error: 'Forbidden: write access required' });

    // Read-only user cannot revoke tokens
    const revokeAttempt = await requestJson(app, 'DELETE', '/token-1', {
      headers: { 'x-user-ref': 'user:default/auditor' },
      body: { reason: 'should fail' },
    });
    assert.equal(revokeAttempt.status, 403);
    assert.deepEqual(revokeAttempt.body, { error: 'Forbidden: revoke access required' });
  } finally {
    await client.destroy();
  }
});

test('express router enforces granular permissions — write-only user cannot revoke', async () => {
  let now = new Date('2026-04-04T12:00:00.000Z');
  const client = createSqliteClient();

  try {
    await applyServiceTokenMigrations(client);
    const db = createKnexServiceTokenDatabase({ client, now: () => now });

    const app = createApp(
      createExpressRouter({
        allowedScopes: ['catalog:read'],
        db,
        defaultTokenLifetimeDays: 30,
        ensureGroupExists: async () => true,
        generateAuditId: (() => {
          let index = 0;
          return () => `audit-${++index}`;
        })(),
        generateId: () => 'token-1',
        generateRawToken: () => 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
        httpAuth: createMockHttpAuth(),
        // Write-only user: can read and write but not revoke
        authorizeRead(credentials) {
          return credentials.principal.userEntityRef === 'user:default/operator';
        },
        authorizeWrite(credentials) {
          return credentials.principal.userEntityRef === 'user:default/operator';
        },
        authorizeRevoke() {
          return false;
        },
        maxTokenLifetimeDays: 365,
        now: () => now,
        scopeCatalogue: [{ id: 'catalog:read', title: 'Catalog read' }],
      }),
    );

    // Write user can create tokens
    const created = await requestJson(app, 'POST', '/', {
      headers: { 'x-user-ref': 'user:default/operator' },
      body: {
        name: 'cicd-pipeline',
        description: 'Used by CI',
        groupEntityRef: 'group:default/platform-team',
        scopes: ['catalog:read'],
        expiresAt: '2026-06-10T00:00:00.000Z',
      },
    });
    assert.equal(created.status, 201);

    // Write user cannot revoke tokens
    const revokeAttempt = await requestJson(app, 'DELETE', '/token-1', {
      headers: { 'x-user-ref': 'user:default/operator' },
      body: { reason: 'should fail' },
    });
    assert.equal(revokeAttempt.status, 403);
    assert.deepEqual(revokeAttempt.body, { error: 'Forbidden: revoke access required' });
  } finally {
    await client.destroy();
  }
});

function createApp(router) {
  const app = express();
  app.use('/api/service-tokens', router);
  return app;
}

async function requestJson(app, method, path, options = {}) {
  const headers = normalizeHeaders(options.headers ?? {});

  const socket = new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      callback();
    },
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
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  res.write = function write(chunk, encoding, callback) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    }
    return originalWrite(chunk, encoding, callback);
  };
  res.end = function end(chunk, encoding, callback) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    }
    return originalEnd(chunk, encoding, callback);
  };

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out handling ${method} ${path}`));
    }, 2000);
    res.on('finish', resolve);
    res.on('error', reject);
    res.on('finish', () => clearTimeout(timeout));
    res.on('error', () => clearTimeout(timeout));
    app.handle(req, res, reject);
    req.push(null);
  });

  const text = Buffer.concat(chunks).toString('utf8');
  return {
    status: res.statusCode,
    body: text ? JSON.parse(text) : undefined,
  };
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}
