import React from 'react';
import { CreateTokenDialog } from './CreateTokenDialog.jsx';
import { scopeFixtures, groupOptionFixtures } from '../fixtures/accessTokens.js';
import { defaultExpiryValue } from '../helpers.js';

const h = React.createElement;

const defaultForm = {
  name: '',
  description: '',
  groupEntityRef: '',
  scopes: [],
  expiresAt: '',
};

const filledForm = {
  name: 'deploy-bot',
  description: 'Used by deployment automation to read catalog entities.',
  groupEntityRef: 'group:default/platform-team',
  scopes: ['catalog:read', 'permission:read'],
  expiresAt: defaultExpiryValue(Date.parse('2026-04-04T12:00:00.000Z')),
};

export default {
  title: 'Service Tokens/Create Token Dialog',
  component: CreateTokenDialog,
  parameters: {
    layout: 'centered',
  },
};

export const Closed = {
  args: {
    open: false,
    scopes: scopeFixtures,
    groupOptions: groupOptionFixtures,
    form: defaultForm,
  },
};

export const OpenEmpty = {
  args: {
    open: true,
    scopes: scopeFixtures,
    groupOptions: groupOptionFixtures,
    form: defaultForm,
  },
};

export const OpenFilled = {
  args: {
    open: true,
    scopes: scopeFixtures,
    groupOptions: groupOptionFixtures,
    form: filledForm,
  },
};

export const OpenSubmitting = {
  args: {
    open: true,
    scopes: scopeFixtures,
    groupOptions: groupOptionFixtures,
    form: filledForm,
    submitting: true,
  },
};

export const OpenSuccess = {
  args: {
    open: true,
    scopes: scopeFixtures,
    groupOptions: groupOptionFixtures,
    form: filledForm,
    createdToken: {
      rawToken:
        'stk_live_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJncm91cDpkZWZhdWx0L3BsYXRmb3JtLXRlYW0ifQ.abc123xyz',
    },
  },
};
