import React from 'react';
import { Box } from '@material-ui/core';
import { ServiceTokensTableView } from './ServiceTokensTableView.jsx';
import { serviceTokenFixtures, storyNow } from '../fixtures/serviceTokens.js';

const h = React.createElement;

export default {
  title: 'Service Tokens/Table',
  component: ServiceTokensTableView,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => h(Box, { maxWidth: 1200 }, h(Story)),
  ],
};

export const Loading = {
  args: {
    loading: true,
    now: storyNow,
  },
};

export const Empty = {
  args: {
    loading: false,
    now: storyNow,
    tokens: [],
  },
};

export const Populated = {
  args: {
    loading: false,
    now: storyNow,
    tokens: [serviceTokenFixtures.active, serviceTokenFixtures.expiring],
    onAudit: () => {},
    onRevoke: () => {},
  },
};

export const IncludesRevoked = {
  args: {
    loading: false,
    now: storyNow,
    tokens: [
      serviceTokenFixtures.active,
      serviceTokenFixtures.expiring,
      serviceTokenFixtures.revoked,
    ],
    onAudit: () => {},
    onRevoke: () => {},
  },
};
