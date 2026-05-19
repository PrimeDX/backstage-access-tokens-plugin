import type { FrontendFeature, RouteRef } from '@backstage/frontend-plugin-api';

declare const serviceTokensPlugin: FrontendFeature;
declare const userTokensAuthPlugin: FrontendFeature;

export declare const rootRouteRef: RouteRef;
export declare const userTokensAuthRouteRef: RouteRef;
export declare const userTokensRouteRef: RouteRef;

export default serviceTokensPlugin;
export { serviceTokensPlugin, userTokensAuthPlugin };
