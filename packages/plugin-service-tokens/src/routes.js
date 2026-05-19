import { createRouteRef } from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

/**
 * Route ref for the user-self-service personal access tokens page. The
 * page is registered at `/settings/personal-tokens`; this ref is
 * exported so app code can navigate to it programmatically.
 */
export const userTokensRouteRef = createRouteRef();

/**
 * Route ref for the OAuth consent surface used by the user-tokens mint
 * flow. The page is registered at `/oauth2`, with
 * `/oauth2/authorize/:sessionId` handled by the page router.
 */
export const userTokensAuthRouteRef = createRouteRef();
