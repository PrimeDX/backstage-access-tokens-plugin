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
  personalAccessTokensAuthRouteRef,
  personalAccessTokensRouteRef,
} from './routes.js';

const serviceTokensPage = PageBlueprint.make({
  params: {
    path: '/admin/access-tokens',
    routeRef: rootRouteRef,
    title: 'Access Tokens',
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
  name: 'personal-access-tokens',
  params: {
    path: 'personal-tokens',
    routeRef: personalAccessTokensRouteRef,
    title: 'Personal Access Tokens',
    loader: () =>
      import('./UserTokensPage.jsx').then(module =>
        React.createElement(module.UserTokensSettingsTab),
      ),
  },
});

const userTokensAuthPage = PageBlueprint.make({
  name: 'access-tokens-auth',
  params: {
    path: '/oauth2',
    routeRef: personalAccessTokensAuthRouteRef,
    title: 'Personal token authorization',
    noHeader: true,
    loader: () =>
      import('./UserTokensConsentPage.jsx').then(module =>
        React.createElement(module.UserTokensConsentRouter),
      ),
  },
});

const accessTokensPlugin = createFrontendPlugin({
  pluginId: 'access-tokens',
  title: 'Access Tokens',
  routes: {
    root: rootRouteRef,
    personalAccessTokens: personalAccessTokensRouteRef,
  },
  extensions: [serviceTokensPage, serviceTokensNavItem, userTokensPage],
});

const personalAccessTokensAuthPlugin = createFrontendPlugin({
  pluginId: 'access-tokens-auth',
  title: 'Personal Token Authorization',
  routes: {
    root: personalAccessTokensAuthRouteRef,
  },
  extensions: [userTokensAuthPage],
});

export {
  rootRouteRef,
  personalAccessTokensAuthRouteRef,
  personalAccessTokensRouteRef,
  accessTokensPlugin,
  personalAccessTokensAuthPlugin,
};
export default accessTokensPlugin;
