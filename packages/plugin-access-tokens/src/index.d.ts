import type { FrontendFeature, RouteRef } from '@backstage/frontend-plugin-api';
import type { JSX } from 'react';

declare const accessTokensPlugin: FrontendFeature;
declare const personalAccessTokensAuthPlugin: FrontendFeature;

export declare const rootRouteRef: RouteRef;
export declare const personalAccessTokensAuthRouteRef: RouteRef;
export declare const personalAccessTokensRouteRef: RouteRef;
export declare function UserTokensSettingsTab(): JSX.Element;
export declare function UserTokensPage(): JSX.Element;

export default accessTokensPlugin;
export {
  accessTokensPlugin,
  personalAccessTokensAuthPlugin,
  UserTokensSettingsTab,
  UserTokensPage,
};
