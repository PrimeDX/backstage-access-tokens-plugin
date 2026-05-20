import React from 'react';
import { Box } from '@material-ui/core';
import { ServiceTokensFilters } from './ServiceTokensFilters.jsx';

const h = React.createElement;

const groupOptions = [
  {
    kind: 'Group',
    namespace: 'default',
    name: 'platform-team',
    label: 'Platform Team',
    value: 'group:default/platform-team',
    description: 'type: team',
  },
  {
    kind: 'Group',
    namespace: 'default',
    name: 'support',
    label: 'Support',
    value: 'group:default/support',
    description: 'type: team',
  },
];

export default {
  title: 'Service Tokens/Filters',
  component: ServiceTokensFilters,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => h(Box, { maxWidth: 800 }, h(Story)),
  ],
};

export const Default = {
  args: {
    status: '',
    groupEntityRef: '',
    groupOptions,
  },
};

export const StatusFiltered = {
  args: {
    status: 'active',
    groupEntityRef: '',
    groupOptions,
  },
};

export const GroupFiltered = {
  args: {
    status: '',
    groupEntityRef: 'group:default/platform-team',
    groupOptions,
  },
};

export const BothFiltered = {
  args: {
    status: 'expiring',
    groupEntityRef: 'group:default/support',
    groupOptions,
  },
};

export const LoadingGroups = {
  args: {
    status: '',
    groupEntityRef: '',
    groupOptions: [],
    groupsLoading: true,
  },
};
