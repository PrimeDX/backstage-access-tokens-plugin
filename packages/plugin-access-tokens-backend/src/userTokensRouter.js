import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

import { decryptRefreshToken, encryptRefreshToken } from './userTokensEncryption.js';

const require = createRequire(import.meta.url);
const express = require('express');

/**
 * Express router mounted under the access-tokens plugin namespace at
 * `/personal/*` (so full URLs are
 * `/api/access-tokens/personal/...`). Implements the six
 * endpoints documented in docs/spec/user-tokens-api.md §1.
 *
 * All routes require an authenticated user session. Each mutation
 * additionally gates on the corresponding `access-tokens:user:*` permission.
 *
 * @param {object} options
 * @param {object} options.db                   personal-access-token database
 * @param {object} options.mintFlowStore        in-flight state store
 * @param {object} options.oauth                OAuth orchestrator
 * @param {object} options.httpAuth             coreServices.httpAuth
 * @param {(creds: any) => Promise<boolean>} options.authorizeRead
 * @param {(creds: any) => Promise<boolean>} options.authorizeWrite
 * @param {(creds: any) => Promise<boolean>} options.authorizeRevoke
 * @param {Buffer} options.encryptionKey
 * @param {() => string} [options.generateId]
 * @param {() => Date} [options.now]
 * @param {{ enabled: boolean, defaultExpiryDays: number, maxExpiryDays: number,
 *           dcrClient?: { clientId: string, clientSecret: string, redirectUri: string } }}
 *         options.userTokensConfig
 * @param {(plugin: string) => Promise<string>} options.getExternalBaseUrl
 *   Used to construct our callback URL (must match the registered redirect_uri).
 * @param {object} [options.logger]
 */
export function createUserTokensRouter(options) {
  const {
    db,
    mintFlowStore,
    oauth,
    httpAuth,
    authorizeRead,
    authorizeWrite,
    authorizeRevoke,
    encryptionKey,
    userTokensConfig,
    getExternalBaseUrl,
    logger,
  } = options;
  const generateId = options.generateId ?? randomUUID;
  const now = options.now ?? (() => new Date());

  const router = express.Router();
  const jsonParser = express.json();
  router.use((req, res, next) => {
    // Tests set req.body directly; production traffic still parses normally.
    if (req.body !== undefined) {
      next();
      return;
    }
    jsonParser(req, res, next);
  });

  // ---- helpers ----

  async function authenticateUser(req, res) {
    try {
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      if (credentials?.principal?.type !== 'user') {
        sendJson(res, 401, { error: 'Unauthorized' });
        return null;
      }
      return { credentials, userEntityRef: credentials.principal.userEntityRef };
    } catch {
      sendJson(res, 401, { error: 'Unauthorized' });
      return null;
    }
  }

  async function buildCallbackUrl() {
    const baseUrl = await getExternalBaseUrl('access-tokens');
    return `${baseUrl}/personal/mint/callback`;
  }

  async function emitAudit(tokenId, event, actor, metadata) {
    try {
      await db.appendUserAuditEvent({
        id: generateId(),
        tokenId,
        event,
        actor,
        metadata,
        occurredAt: now(),
      });
    } catch (err) {
      logger?.warn?.('user-tokens audit emit failed', { event, err: err?.message });
    }
  }

  // ---- POST /personal/mint ----

  router.post('/personal/mint', async (req, res) => {
    const auth = await authenticateUser(req, res);
    if (!auth) return;
    if (!(await authorizeWrite(auth.credentials))) {
      sendJson(res, 403, { error: 'Forbidden: access-tokens:user:write required' });
      return;
    }

    const { name, expiresAt } = req.body ?? {};
    const validation = validateMintInput({ name, expiresAt }, userTokensConfig, now());
    if (validation.error) {
      sendJson(res, 400, { error: validation.error });
      return;
    }

    // Per-user uniqueness on name
    const existing = await db.findUserTokenByUserAndName(auth.userEntityRef, validation.name);
    if (existing) {
      sendJson(res, 400, {
        error: `A token named "${validation.name}" already exists for this user`,
      });
      return;
    }

    try {
      const callbackUrl = await buildCallbackUrl();
      const client = await oauth.ensureDcrClient({
        configClient: userTokensConfig.dcrClient,
        callbackUrl,
      });
      const flow = mintFlowStore.create({
        userEntityRef: auth.userEntityRef,
        name: validation.name,
        expiresAt: validation.expiresAt,
      });
      const authorizeUrl = await oauth.buildAuthorizeUrl({
        clientId: client.clientId,
        redirectUri: callbackUrl,
        state: flow.state,
        codeVerifier: flow.codeVerifier,
      });
      sendJson(res, 200, {
        flowId: flow.flowId,
        authorizeUrl,
        state: flow.state,
      });
    } catch (err) {
      logger?.error?.('user-tokens mint init failed', { err: err?.message });
      sendJson(res, 502, { error: 'Failed to initiate mint flow', detail: err?.message });
    }
  });

  // ---- GET /personal/mint/callback ----

  function redirectWithMintError(res, message) {
    const payload = { message };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const url = `${userTokensConfig.appBaseUrl}/settings/personal-tokens#personal-access-tokens-mint-error=${encoded}`;
    res.redirect(302, url);
  }

  router.get('/personal/mint/callback', async (req, res) => {
    const { code, state, error: oauthError } = req.query ?? {};
    if (oauthError) {
      redirectWithMintError(res, `OAuth flow returned error: ${oauthError}`);
      return;
    }
    if (typeof code !== 'string' || typeof state !== 'string') {
      redirectWithMintError(res, 'OAuth callback missing code or state');
      return;
    }
    const inflight = mintFlowStore.consume(state);
    if (!inflight) {
      redirectWithMintError(res, 'OAuth state is unknown or expired; try again');
      return;
    }

    try {
      const callbackUrl = await buildCallbackUrl();
      const client = await oauth.ensureDcrClient({
        configClient: userTokensConfig.dcrClient,
        callbackUrl,
      });
      const tokens = await oauth.exchangeCodeForTokens({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        code,
        redirectUri: callbackUrl,
        codeVerifier: inflight.codeVerifier,
      });

      const sessionId = oauth.parseSessionId(tokens.refreshToken);
      const { ciphertext, iv, tag } = encryptRefreshToken(encryptionKey, tokens.refreshToken);
      const prefix = tokens.refreshToken.slice(0, 8);

      const expiresAt =
        inflight.expiresAt ??
        new Date(now().getTime() + userTokensConfig.defaultExpiryDays * 86_400_000);
      const id = generateId();
      await db.createUserToken({
        id,
        name: inflight.name,
        userEntityRef: inflight.userEntityRef,
        prefix,
        sessionId,
        encryptedToken: ciphertext,
        encryptedTokenIv: iv,
        encryptedTokenTag: tag,
        createdAt: now(),
        expiresAt,
        lastUsedAt: null,
        revokedAt: null,
      });
      await emitAudit(id, 'MINTED', inflight.userEntityRef, {
        flowId: inflight.flowId,
        sessionId,
      });

      // Redirect back to the frontend's settings page with the
      // payload in a URL fragment. Fragments are never sent to the
      // server (no logs), and the frontend's bundled JS (CSP-allowed)
      // reads the fragment, opens the result dialog, and clears it.
      // We deliberately avoid returning inline-script HTML here because
      // Backstage's default CSP (`script-src 'self' 'unsafe-eval'`) drops
      // inline scripts. See docs/spec/user-tokens-architecture.md §2.3.
      const metadata = {
        id,
        name: inflight.name,
        createdAt: now().toISOString(),
        expiresAt: expiresAt.toISOString(),
        prefix,
      };
      const payload = {
        type: 'personal-access-tokens-mint-result',
        flowId: inflight.flowId,
        token: tokens.refreshToken,
        metadata,
      };
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const redirectUrl = `${userTokensConfig.appBaseUrl}/settings/personal-tokens#personal-access-tokens-mint=${encoded}`;
      res.redirect(302, redirectUrl);
    } catch (err) {
      logger?.error?.('user-tokens mint callback failed', { err: err?.message });
      redirectWithMintError(res, `Failed to complete mint flow: ${err?.message ?? 'unknown error'}`);
    }
  });

  // ---- GET /personal ----

  router.get('/personal', async (req, res) => {
    const auth = await authenticateUser(req, res);
    if (!auth) return;
    if (!(await authorizeRead(auth.credentials))) {
      sendJson(res, 403, { error: 'Forbidden: access-tokens:user:read required' });
      return;
    }
    const tokens = await db.listUserTokensForUser(auth.userEntityRef, { now });
    sendJson(res, 200, { tokens });
  });

  // ---- GET /personal/:id ----

  router.get('/personal/:id', async (req, res) => {
    const auth = await authenticateUser(req, res);
    if (!auth) return;
    if (!(await authorizeRead(auth.credentials))) {
      sendJson(res, 403, { error: 'Forbidden: access-tokens:user:read required' });
      return;
    }
    const row = await db.getUserTokenForUser(req.params.id, auth.userEntityRef);
    if (!row) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    sendJson(res, 200, publicRow(row, now()));
  });

  // ---- DELETE /personal/:id ----

  router.delete('/personal/:id', async (req, res) => {
    const auth = await authenticateUser(req, res);
    if (!auth) return;
    if (!(await authorizeRevoke(auth.credentials))) {
      sendJson(res, 403, { error: 'Forbidden: access-tokens:user:revoke required' });
      return;
    }
    const row = await db.getUserTokenForUser(req.params.id, auth.userEntityRef);
    if (!row) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    if (row.revokedAt) {
      // Already revoked — idempotent success.
      res.status(204).end();
      return;
    }
    if (!row.encryptedToken || !row.encryptedTokenIv || !row.encryptedTokenTag) {
      sendJson(res, 500, { error: 'Token material missing for active row; cannot revoke' });
      return;
    }

    try {
      const callbackUrl = await buildCallbackUrl();
      const client = await oauth.ensureDcrClient({
        configClient: userTokensConfig.dcrClient,
        callbackUrl,
      });
      const plaintext = decryptRefreshToken(encryptionKey, {
        ciphertext: row.encryptedToken,
        iv: row.encryptedTokenIv,
        tag: row.encryptedTokenTag,
      });
      const ok = await oauth.revokeRefreshToken({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        refreshToken: plaintext,
      });
      if (!ok) {
        sendJson(res, 502, { error: 'Upstream /revoke rejected the request' });
        return;
      }
      await db.markUserTokenRevoked(row.id, now());
      await emitAudit(row.id, 'REVOKED', auth.userEntityRef, null);
      res.status(204).end();
    } catch (err) {
      logger?.error?.('user-tokens revoke failed', { err: err?.message, id: row.id });
      sendJson(res, 502, { error: 'Failed to revoke token', detail: err?.message });
    }
  });

  // ---- GET /personal/:id/audit ----

  router.get('/personal/:id/audit', async (req, res) => {
    const auth = await authenticateUser(req, res);
    if (!auth) return;
    if (!(await authorizeRead(auth.credentials))) {
      sendJson(res, 403, { error: 'Forbidden: access-tokens:user:read required' });
      return;
    }
    const row = await db.getUserTokenForUser(req.params.id, auth.userEntityRef);
    if (!row) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const events = await db.getUserAuditLog(row.id);
    sendJson(res, 200, {
      events: events.map(e => ({
        id: e.id,
        tokenId: e.tokenId,
        event: e.event,
        actor: e.actor,
        metadata: e.metadata,
        occurredAt: e.occurredAt instanceof Date ? e.occurredAt.toISOString() : e.occurredAt,
      })),
    });
  });

  return router;
}

// ---- utilities ----

function sendJson(res, status, body) {
  if (body === undefined) {
    res.status(status).end();
    return;
  }
  res.status(status).json(body);
}

function publicRow(record, currentTime) {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
    prefix: record.prefix,
    revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
    status: record.revokedAt
      ? 'revoked'
      : record.expiresAt && record.expiresAt <= currentTime
      ? 'expired'
      : 'active',
  };
}

function validateMintInput(input, config, currentTime) {
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    return { error: 'name is required' };
  }
  if (input.name.length > 100) {
    return { error: 'name must be 100 characters or less' };
  }
  const trimmedName = input.name.trim();
  if (!/^[A-Za-z0-9 _.\-:/]+$/.test(trimmedName)) {
    return { error: 'name contains disallowed characters' };
  }

  let expiresAt;
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return { error: 'expiresAt must be a valid ISO 8601 date' };
    }
    if (expiresAt <= currentTime) {
      return { error: 'expiresAt must be in the future' };
    }
    const maxExpiry = new Date(
      currentTime.getTime() + config.maxExpiryDays * 86_400_000,
    );
    if (expiresAt > maxExpiry) {
      return {
        error: `expiresAt must be ≤ ${config.maxExpiryDays} days from now`,
      };
    }
  }

  return { name: trimmedName, expiresAt };
}
