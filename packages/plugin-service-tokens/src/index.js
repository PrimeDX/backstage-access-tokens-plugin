import React from 'react';
import { createFrontendPlugin, PageBlueprint } from '@backstage/frontend-plugin-api';
import {
  rootRouteRef,
  userTokensAuthRouteRef,
  userTokensRouteRef,
} from './routes.js';

const serviceTokensPage = PageBlueprint.make({
  params: {
    path: '/admin/service-tokens',
    routeRef: rootRouteRef,
    title: 'Service Tokens',
    loader: () =>
      import('./ServiceTokensPage.jsx').then(module =>
        React.createElement(module.ServiceTokensPage),
      ),
  },
});

const userTokensPage = PageBlueprint.make({
  name: 'user-tokens',
  params: {
    path: '/settings/personal-tokens',
    routeRef: userTokensRouteRef,
    title: 'Personal access tokens',
    loader: () =>
      import('./UserTokensPage.jsx').then(module =>
        React.createElement(module.UserTokensPage),
      ),
  },
});

const userTokensAuthPage = PageBlueprint.make({
  name: 'user-tokens-auth',
  params: {
    path: '/oauth2',
    routeRef: userTokensAuthRouteRef,
    title: 'Personal token authorization',
    noHeader: true,
    loader: () =>
      import('./UserTokensConsentPage.jsx').then(module =>
        React.createElement(module.UserTokensConsentRouter),
      ),
  },
});

const serviceTokensPlugin = createFrontendPlugin({
  pluginId: 'service-tokens',
  title: 'Service Tokens',
  routes: {
    root: rootRouteRef,
    userTokens: userTokensRouteRef,
  },
  extensions: [serviceTokensPage, userTokensPage],
});

const userTokensAuthPlugin = createFrontendPlugin({
  pluginId: 'service-tokens-auth',
  title: 'Personal Token Authorization',
  routes: {
    root: userTokensAuthRouteRef,
  },
  extensions: [userTokensAuthPage],
});

export {
  rootRouteRef,
  userTokensAuthRouteRef,
  userTokensRouteRef,
  serviceTokensPlugin,
  userTokensAuthPlugin,
};
export default serviceTokensPlugin;
