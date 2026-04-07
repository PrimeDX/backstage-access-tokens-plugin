import React from 'react';
import { Box } from '@material-ui/core';
import { ServiceTokensFilters } from './ServiceTokensFilters.jsx';

const h = React.createElement;

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
  },
};

export const StatusFiltered = {
  args: {
    status: 'active',
    groupEntityRef: '',
  },
};

export const GroupFiltered = {
  args: {
    status: '',
    groupEntityRef: 'group:default/platform-team',
  },
};

export const BothFiltered = {
  args: {
    status: 'expiring',
    groupEntityRef: 'group:default/support',
  },
};
