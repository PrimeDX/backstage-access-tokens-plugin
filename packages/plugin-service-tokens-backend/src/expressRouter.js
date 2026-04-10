import { createRequire } from 'node:module';
import {
  handleCreateToken,
  handleGetAuditLog,
  handleGetScopes,
  handleGetToken,
  handleListTokens,
  handleRevokeToken,
} from './http.js';

const require = createRequire(import.meta.url);
const express = require('express');

function sendJson(res, result) {
  if (result.body === undefined) {
    res.status(result.status).end();
    return;
  }

  res.status(result.status).json(result.body);
}

function createErrorResponse(message, status = 403) {
  return {
    status,
    body: { error: message },
  };
}

/**
 * Authenticate the request and extract the user entity ref.
 * Returns { credentials, userEntityRef } on success, or sends an error response and returns null.
 */
async function authenticateUser(req, res, options) {
  try {
    const credentials = await options.httpAuth.credentials(req, { allow: ['user'] });
    if (credentials.principal.type !== 'user') {
      sendJson(res, createErrorResponse('Unauthorized', 401));
      return null;
    }

    return {
      credentials,
      userEntityRef: credentials.principal.userEntityRef,
    };
  } catch (error) {
    sendJson(res, createErrorResponse('Unauthorized', 401));
    return null;
  }
}

export function createExpressRouter(options) {
  const router = express.Router();
  const now = options.now ?? (() => new Date());

  const jsonParser = express.json();
  router.use((req, res, next) => {
    if (req.body !== undefined) {
      next();
      return;
    }

    jsonParser(req, res, next);
  });

  // --- Read routes: require serviceTokensReadPermission ---

  router.get('/scopes', async (req, res) => {
    const auth = await authenticateUser(req, res, options);
    if (!auth) return;

    const allowed = await options.authorizeRead(auth.credentials);
    if (!allowed) {
      sendJson(res, createErrorResponse('Forbidden: read access required'));
      return;
    }

    sendJson(
      res,
      await handleGetScopes(
        {
          body: undefined,
        },
        {
          scopeCatalogue: options.scopeCatalogue,
        },
      ),
    );
  });

  router.get('/', async (req, res) => {
    const auth = await authenticateUser(req, res, options);
    if (!auth) return;

    const allowed = await options.authorizeRead(auth.credentials);
    if (!allowed) {
      sendJson(res, createErrorResponse('Forbidden: read access required'));
      return;
    }

    sendJson(
      res,
      await handleListTokens(
        {
          query: req.query,
        },
        {
          db: options.db,
          now,
        },
      ),
    );
  });

  router.get('/:id', async (req, res) => {
    const auth = await authenticateUser(req, res, options);
    if (!auth) return;

    const allowed = await options.authorizeRead(auth.credentials);
    if (!allowed) {
      sendJson(res, createErrorResponse('Forbidden: read access required'));
      return;
    }

    sendJson(
      res,
      await handleGetToken(
        {
          params: req.params,
        },
        {
          db: options.db,
          now,
        },
      ),
    );
  });

  router.get('/:id/audit', async (req, res) => {
    const auth = await authenticateUser(req, res, options);
    if (!auth) return;

    const allowed = await options.authorizeRead(auth.credentials);
    if (!allowed) {
      sendJson(res, createErrorResponse('Forbidden: read access required'));
      return;
    }

    sendJson(
      res,
      await handleGetAuditLog(
        {
          params: req.params,
        },
        {
          db: options.db,
        },
      ),
    );
  });

  // --- Write route: requires serviceTokensWritePermission ---

  router.post('/', async (req, res) => {
    const auth = await authenticateUser(req, res, options);
    if (!auth) return;

    const allowed = await options.authorizeWrite(auth.credentials);
    if (!allowed) {
      sendJson(res, createErrorResponse('Forbidden: write access required'));
      return;
    }

    sendJson(
      res,
      await handleCreateToken(
        {
          body: req.body,
          userEntityRef: auth.userEntityRef,
        },
        {
          allowedScopes: options.allowedScopes,
          db: options.db,
          defaultTokenLifetimeDays: options.defaultTokenLifetimeDays,
          ensureGroupExists: options.ensureGroupExists,
          generateAuditId: options.generateAuditId,
          generateId: options.generateId,
          generateRawToken: options.generateRawToken,
          maxTokenLifetimeDays: options.maxTokenLifetimeDays,
          now,
        },
      ),
    );
  });

  // --- Revoke route: requires serviceTokensRevokePermission ---

  router.delete('/:id', async (req, res) => {
    const auth = await authenticateUser(req, res, options);
    if (!auth) return;

    const allowed = await options.authorizeRevoke(auth.credentials);
    if (!allowed) {
      sendJson(res, createErrorResponse('Forbidden: revoke access required'));
      return;
    }

    sendJson(
      res,
      await handleRevokeToken(
        {
          params: req.params,
          body: req.body,
          userEntityRef: auth.userEntityRef,
        },
        {
          db: options.db,
          generateAuditId: options.generateAuditId,
          now,
        },
      ),
    );
  });

  return router;
}
