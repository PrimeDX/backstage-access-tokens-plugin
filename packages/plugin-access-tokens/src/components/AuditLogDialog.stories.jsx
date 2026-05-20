import React from 'react';
import { AuditLogDialog } from './AuditLogDialog.jsx';
import { serviceTokenFixtures, auditLogFixtures } from '../fixtures/accessTokens.js';

const h = React.createElement;

export default {
  title: 'Service Tokens/Audit Log Dialog',
  component: AuditLogDialog,
  parameters: {
    layout: 'centered',
  },
};

export const Closed = {
  args: {
    open: false,
    token: serviceTokenFixtures.active,
    entries: [],
    loading: false,
  },
};

export const Loading = {
  args: {
    open: true,
    token: serviceTokenFixtures.active,
    entries: [],
    loading: true,
  },
};

export const Empty = {
  args: {
    open: true,
    token: serviceTokenFixtures.active,
    entries: [],
    loading: false,
  },
};

export const WithEntries = {
  args: {
    open: true,
    token: serviceTokenFixtures.active,
    entries: auditLogFixtures,
    loading: false,
  },
};
