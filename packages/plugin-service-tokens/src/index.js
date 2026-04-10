import React from 'react';
import { createFrontendPlugin, PageBlueprint } from '@backstage/frontend-plugin-api';
import { rootRouteRef } from './routes.js';

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

const serviceTokensPlugin = createFrontendPlugin({
  pluginId: 'service-tokens',
  title: 'Service Tokens',
  routes: {
    root: rootRouteRef,
  },
  extensions: [serviceTokensPage],
});

export { rootRouteRef, serviceTokensPlugin };
export default serviceTokensPlugin;
