import type { FrontendFeature, RouteRef } from '@backstage/frontend-plugin-api';

declare const accessTokensPlugin: FrontendFeature;
declare const personalAccessTokensAuthPlugin: FrontendFeature;

export declare const rootRouteRef: RouteRef;
export declare const personalAccessTokensAuthRouteRef: RouteRef;
export declare const personalAccessTokensRouteRef: RouteRef;

export default accessTokensPlugin;
export { accessTokensPlugin, personalAccessTokensAuthPlugin };
