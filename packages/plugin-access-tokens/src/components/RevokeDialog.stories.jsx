import React from 'react';
import { RevokeDialog } from './RevokeDialog.jsx';
import { serviceTokenFixtures } from '../fixtures/accessTokens.js';

const h = React.createElement;

export default {
  title: 'Service Tokens/Revoke Dialog',
  component: RevokeDialog,
  parameters: {
    layout: 'centered',
  },
};

export const Closed = {
  args: {
    open: false,
    token: serviceTokenFixtures.active,
    reason: '',
  },
};

export const Open = {
  args: {
    open: true,
    token: serviceTokenFixtures.active,
    reason: '',
  },
};

export const OpenWithReason = {
  args: {
    open: true,
    token: serviceTokenFixtures.active,
    reason: 'Credential rotation — quarterly policy',
  },
};

export const OpenRevoking = {
  args: {
    open: true,
    token: serviceTokenFixtures.active,
    reason: 'Credential rotation — quarterly policy',
    revoking: true,
  },
};
