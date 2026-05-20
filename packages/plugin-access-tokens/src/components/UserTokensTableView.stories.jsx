import React from 'react';
import { Box } from '@material-ui/core';
import { UserTokensTableView } from './UserTokensTableView.jsx';
import { userTokenFixtures } from '../fixtures/accessTokens.js';

const h = React.createElement;

export default {
  title: 'User Tokens/Table',
  component: UserTokensTableView,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => h(Box, { maxWidth: 1100 }, h(Story)),
  ],
};

export const Empty = {
  args: {
    tokens: [],
  },
};

export const Active = {
  args: {
    tokens: [userTokenFixtures.active],
    onRevoke: () => {},
  },
};

export const Revoked = {
  args: {
    tokens: [userTokenFixtures.revoked],
    onRevoke: () => {},
  },
};

export const Mixed = {
  args: {
    tokens: [
      userTokenFixtures.expired,
      userTokenFixtures.active,
      userTokenFixtures.revoked,
    ],
    onRevoke: () => {},
  },
};
