import { createHttpApi } from './router.js';

export function createAuthorizedHttpApi(deps) {
  const api = createHttpApi(deps);

  return {
    async handle(request) {
      const userEntityRef = await deps.getUserEntityRef(request);
      if (!userEntityRef) {
        return {
          status: 401,
          body: { error: 'Unauthorized' },
        };
      }

      // Determine which permission check to use based on the request
      const permissionCheck = resolvePermissionCheck(request, deps);
      const allowed = await permissionCheck(userEntityRef, request);
      if (!allowed) {
        return {
          status: 403,
          body: { error: 'Forbidden: access denied' },
        };
      }

      return api.handle({
        ...request,
        userEntityRef,
      });
    },
  };
}

function resolvePermissionCheck(request, deps) {
  // Write operations
  if (request.method === 'POST') {
    return deps.isWriteAllowed ?? deps.isAdmin;
  }

  // Revoke operations
  if (request.method === 'DELETE') {
    return deps.isRevokeAllowed ?? deps.isAdmin;
  }

  // Read operations (GET)
  return deps.isReadAllowed ?? deps.isAdmin;
}
