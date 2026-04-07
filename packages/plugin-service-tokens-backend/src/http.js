import { createToken } from './createToken.js';
import { getToken } from './getToken.js';
import { listTokens } from './listTokens.js';
import { revokeToken } from './revokeToken.js';
import { getScopeCatalogue } from './scopes.js';

export async function handleCreateToken(request, deps) {
  try {
    const result = await createToken(request.body, {
      allowedScopes: deps.allowedScopes,
      db: deps.db,
      createdBy: request.userEntityRef,
      defaultTokenLifetimeDays: deps.defaultTokenLifetimeDays,
      ensureGroupExists: deps.ensureGroupExists,
      generateId: deps.generateId,
      generateAuditId: deps.generateAuditId,
      generateRawToken: deps.generateRawToken,
      maxTokenLifetimeDays: deps.maxTokenLifetimeDays,
      now: deps.now,
    });

    return {
      status: 201,
      body: result,
    };
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      return {
        status: 422,
        body: { error: error.message },
      };
    }

    if (error.code === 'CONFLICT') {
      return {
        status: 409,
        body: { error: error.message },
      };
    }

    throw error;
  }
}

export async function handleRevokeToken(request, deps) {
  try {
    await revokeToken(request.params.id, {
      db: deps.db,
      revokedBy: request.userEntityRef,
      reason: request.body.reason,
      generateAuditId: deps.generateAuditId,
      now: deps.now,
    });

    return {
      status: 204,
      body: undefined,
    };
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return {
        status: 404,
        body: { error: error.message },
      };
    }

    if (error.code === 'CONFLICT') {
      return {
        status: 409,
        body: { error: error.message },
      };
    }

    throw error;
  }
}

export async function handleGetAuditLog(request, deps) {
  const events = await deps.db.getAuditLog(request.params.id);

  return {
    status: 200,
    body: {
      events,
    },
  };
}

export async function handleGetToken(request, deps) {
  try {
    const token = await getToken(request.params.id, {
      db: deps.db,
      now: deps.now,
    });

    return {
      status: 200,
      body: token,
    };
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return {
        status: 404,
        body: { error: error.message },
      };
    }

    throw error;
  }
}

export async function handleListTokens(request, deps) {
  const limit = request.query?.limit ? Number(request.query.limit) : 50;
  const offset = request.query?.offset ? Number(request.query.offset) : 0;
  const result = await listTokens(
    {
      groupEntityRef: request.query?.groupEntityRef,
      status: request.query?.status,
      limit,
      offset,
    },
    {
      db: deps.db,
      now: deps.now,
    },
  );

  return {
    status: 200,
    body: {
      tokens: result.tokens,
      total: result.total,
      limit,
      offset,
    },
  };
}

export async function handleGetScopes(_request, deps) {
  return {
    status: 200,
    body: {
      scopes: deps.scopeCatalogue ?? getScopeCatalogue(),
    },
  };
}
