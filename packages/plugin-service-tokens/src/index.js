import React from 'react';
import {
  createFrontendPlugin,
  NavItemBlueprint,
  PageBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import VpnKeyIcon from '@material-ui/icons/VpnKey';
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

function ServiceTokensIcon(props) {
  const Icon = VpnKeyIcon?.default ?? VpnKeyIcon;
  return React.createElement(Icon, props);
}

const serviceTokensNavItem = NavItemBlueprint.make({
  params: {
    routeRef: rootRouteRef,
    title: 'Service Tokens',
    icon: ServiceTokensIcon,
  },
});

const userTokensPage = SubPageBlueprint.make({
  attachTo: { id: 'page:user-settings', input: 'pages' },
  name: 'user-tokens',
  params: {
    path: 'personal-tokens',
    routeRef: userTokensRouteRef,
    title: 'Personal Access Tokens',
    loader: () =>
      import('./UserTokensPage.jsx').then(module =>
        React.createElement(module.UserTokensSettingsTab),
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
  extensions: [serviceTokensPage, serviceTokensNavItem, userTokensPage],
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
