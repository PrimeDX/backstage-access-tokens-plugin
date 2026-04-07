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

      const admin = await deps.isAdmin(userEntityRef, request);
      if (!admin) {
        return {
          status: 403,
          body: { error: 'Forbidden: admin access required' },
        };
      }

      return api.handle({
        ...request,
        userEntityRef,
      });
    },
  };
}
