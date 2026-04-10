import React from 'react';
import {
  Box,
  Button,
  MenuItem,
  TextField,
} from '@material-ui/core';

const h = React.createElement;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
];

export function ServiceTokensFilters({
  status = '',
  groupEntityRef = '',
  onStatusChange = () => {},
  onGroupChange = () => {},
}) {
  const hasFilters = Boolean(status || groupEntityRef);

  return h(
    Box,
    { display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', py: 1 },
    h(
      TextField,
      {
        select: true,
        size: 'small',
        label: 'Status',
        value: status,
        onChange: e => onStatusChange(e.target.value),
        style: { minWidth: 160 },
        variant: 'outlined',
      },
      ...STATUS_OPTIONS.map(opt =>
        h(MenuItem, { key: opt.value, value: opt.value }, opt.label),
      ),
    ),
    h(TextField, {
      size: 'small',
      label: 'Group',
      value: groupEntityRef,
      onChange: e => onGroupChange(e.target.value),
      placeholder: 'group:default/…',
      style: { minWidth: 240 },
      variant: 'outlined',
    }),
    hasFilters &&
      h(
        Button,
        {
          size: 'small',
          variant: 'text',
          onClick: () => {
            onStatusChange('');
            onGroupChange('');
          },
        },
        'Clear',
      ),
  );
}
