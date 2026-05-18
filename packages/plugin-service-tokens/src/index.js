import React from 'react';
import { createFrontendPlugin, PageBlueprint } from '@backstage/frontend-plugin-api';
import { rootRouteRef, userTokensRouteRef } from './routes.js';

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

const serviceTokensPlugin = createFrontendPlugin({
  pluginId: 'service-tokens',
  title: 'Service Tokens',
  routes: {
    root: rootRouteRef,
    userTokens: userTokensRouteRef,
  },
  extensions: [serviceTokensPage, userTokensPage],
});

export { rootRouteRef, userTokensRouteRef, serviceTokensPlugin };
export default serviceTokensPlugin;
