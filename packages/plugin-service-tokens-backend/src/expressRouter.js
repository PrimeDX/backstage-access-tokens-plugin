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

function createUnauthorizedResponse(message, status = 403) {
  return {
    status,
    body: { error: message },
  };
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

  router.use(async (req, res, next) => {
    try {
      const credentials = await options.httpAuth.credentials(req, { allow: ['user'] });
      if (credentials.principal.type !== 'user') {
        sendJson(res, createUnauthorizedResponse('Unauthorized', 401));
        return;
      }

      const userEntityRef = credentials.principal.userEntityRef;
      const isAdminUser = options.authorizeAdminAccess
        ? await options.authorizeAdminAccess({ credentials, userEntityRef })
        : options.isAdminUser(userEntityRef);
      if (!isAdminUser) {
        sendJson(res, createUnauthorizedResponse('Forbidden: admin access required'));
        return;
      }

      req.serviceTokensUserEntityRef = userEntityRef;
      next();
    } catch (error) {
      const message = error?.name === 'AuthenticationError' ? 'Unauthorized' : 'Unauthorized';
      sendJson(res, createUnauthorizedResponse(message, 401));
    }
  });

  router.get('/scopes', async (_req, res) => {
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

  router.post('/', async (req, res) => {
    sendJson(
      res,
      await handleCreateToken(
        {
          body: req.body,
          userEntityRef: req.serviceTokensUserEntityRef,
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

  router.get('/:id', async (req, res) => {
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

  router.delete('/:id', async (req, res) => {
    sendJson(
      res,
      await handleRevokeToken(
        {
          params: req.params,
          body: req.body,
          userEntityRef: req.serviceTokensUserEntityRef,
        },
        {
          db: options.db,
          generateAuditId: options.generateAuditId,
          now,
        },
      ),
    );
  });

  router.get('/:id/audit', async (req, res) => {
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

  return router;
}
