import React from 'react';
import {
  Box,
  Button,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { CatalogAutocomplete } from '@backstage/plugin-catalog-react';

const h = React.createElement;

const useStyles = makeStyles({
  groupAutocomplete: {
    margin: 0,
    '& [class*="BackstageAutocompleteBase-inputRoot"]': {
      marginTop: 0,
    },
  },
});

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
  groupOptions = [],
  groupsLoading = false,
  onStatusChange = () => {},
  onGroupChange = () => {},
}) {
  const classes = useStyles();
  const hasFilters = Boolean(status || groupEntityRef);
  const selectedGroup = groupOptions.find(opt => opt.value === groupEntityRef) ?? null;
  const groupOptionValues = new Set(groupOptions.map(opt => opt.value));

  function handleGroupSelection(_event, option, reason) {
    if (reason === 'clear' || option === null) {
      onGroupChange('');
      return;
    }

    if (option?.value && groupOptionValues.has(option.value)) {
      onGroupChange(option.value);
    }
  }

  return h(
    Box,
    { py: 1 },
    h(
      Grid,
      { container: true, spacing: 2, alignItems: 'center' },
      h(
        Grid,
        { item: true },
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
      ),
      h(
        Grid,
        { item: true },
        h(CatalogAutocomplete, {
          name: 'service-token-group-filter',
          className: classes.groupAutocomplete,
          options: groupOptions,
          value: selectedGroup,
          disabled: groupsLoading || groupOptions.length === 0,
          getOptionLabel: option => option?.label ?? '',
          getOptionSelected: (option, value) => option?.value === value?.value,
          onChange: handleGroupSelection,
          renderOption: option =>
            h(
              Box,
              null,
              h(Typography, { variant: 'body2' }, option.label),
              h(
                Typography,
                { variant: 'caption', color: 'textSecondary', display: 'block' },
                option.value,
              ),
            ),
          TextFieldProps: {
            placeholder: 'Group',
            inputProps: {
              'aria-label': 'Group',
            },
            style: { minWidth: 280 },
          },
        }),
      ),
      hasFilters &&
        h(
          Grid,
          { item: true },
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
        ),
    ),
  );
}
