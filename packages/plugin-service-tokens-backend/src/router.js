import {
  handleCreateToken,
  handleGetAuditLog,
  handleGetScopes,
  handleGetToken,
  handleListTokens,
  handleRevokeToken,
} from './http.js';

export function createHttpApi(deps) {
  return {
    async handle(request) {
      if (request.method === 'POST' && request.path === '/api/service-tokens') {
        return handleCreateToken(request, deps);
      }

      if (request.method === 'GET' && request.path === '/api/service-tokens') {
        return handleListTokens(request, deps);
      }

      if (request.method === 'GET' && request.path === '/api/service-tokens/scopes') {
        return handleGetScopes(request, deps);
      }

      const auditMatch = request.path.match(/^\/api\/service-tokens\/([^/]+)\/audit$/);
      if (request.method === 'GET' && auditMatch) {
        return handleGetAuditLog(
          {
            ...request,
            params: { id: auditMatch[1] },
          },
          deps,
        );
      }

      const tokenMatch = request.path.match(/^\/api\/service-tokens\/([^/]+)$/);
      if (tokenMatch) {
        if (request.method === 'GET') {
          return handleGetToken(
            {
              ...request,
              params: { id: tokenMatch[1] },
            },
            deps,
          );
        }

        if (request.method === 'DELETE') {
          return handleRevokeToken(
            {
              ...request,
              params: { id: tokenMatch[1] },
            },
            deps,
          );
        }
      }

      return {
        status: 404,
        body: { error: 'Not found' },
      };
    },
  };
}
