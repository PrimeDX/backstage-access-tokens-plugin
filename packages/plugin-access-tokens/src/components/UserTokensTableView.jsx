import React from 'react';
import {
  Box,
  Button,
  Chip,
  Typography,
} from '@material-ui/core';
import { Table as BackstageTable } from '@backstage/core-components';

import { formatUserTokenDate } from '../userTokensHelpers.js';

const h = React.createElement;

const STATUS_COLOR = {
  active: 'primary',
  expired: 'default',
  revoked: 'secondary',
};

function compareStrings(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'en-US');
}

function compareDates(left, right, field) {
  const leftTime = Date.parse(left?.[field] ?? '');
  const rightTime = Date.parse(right?.[field] ?? '');
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (!leftValid && !rightValid) {
    return 0;
  }

  if (!leftValid) {
    return 1;
  }

  if (!rightValid) {
    return -1;
  }

  return leftTime - rightTime;
}

function compareDatesNewestFirst(left, right, field) {
  const leftTime = Date.parse(left?.[field] ?? '');
  const rightTime = Date.parse(right?.[field] ?? '');
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (!leftValid && !rightValid) {
    return 0;
  }

  if (!leftValid) {
    return 1;
  }

  if (!rightValid) {
    return -1;
  }

  return rightTime - leftTime;
}

function tokenToTableRow(token) {
  const status = token.status ?? 'active';

  return {
    ...token,
    status,
    createdAtFormatted: formatUserTokenDate(token.createdAt),
    expiresAtFormatted: formatUserTokenDate(token.expiresAt),
    lastUsedAtFormatted: formatUserTokenDate(token.lastUsedAt),
  };
}

export function UserTokensTableView({ tokens = [], onRevoke = () => {} }) {
  if (!tokens.length) {
    return h(
      Box,
      { p: 2 },
      h(
        Typography,
        { variant: 'body2', color: 'textSecondary' },
        'You haven\'t minted any tokens yet. Click "Create token" to start.',
      ),
    );
  }

  const rows = tokens
    .map(tokenToTableRow)
    .sort((left, right) => compareDatesNewestFirst(left, right, 'createdAt'));

  return h(BackstageTable, {
    data: rows,
    options: {
      paging: false,
      padding: 'dense',
      search: false,
      showTitle: false,
      sorting: true,
      thirdSortClick: false,
      toolbar: false,
    },
    columns: [
      {
        title: 'Name',
        field: 'name',
        customSort: (left, right) => compareStrings(left.name, right.name),
        render: token => h(Typography, { variant: 'body2' }, token.name),
      },
      {
        title: 'Created',
        field: 'createdAt',
        customSort: (left, right) => compareDates(left, right, 'createdAt'),
        render: token =>
          h('span', { title: token.createdAt ?? '' }, token.createdAtFormatted),
      },
      {
        title: 'Expires',
        field: 'expiresAt',
        customSort: (left, right) => compareDates(left, right, 'expiresAt'),
        render: token =>
          h('span', { title: token.expiresAt ?? '' }, token.expiresAtFormatted),
      },
      {
        title: 'Last used',
        field: 'lastUsedAt',
        customSort: (left, right) => compareDates(left, right, 'lastUsedAt'),
        render: token =>
          h('span', { title: token.lastUsedAt ?? '' }, token.lastUsedAtFormatted),
      },
      {
        title: 'Status',
        field: 'status',
        customSort: (left, right) => compareStrings(left.status, right.status),
        render: token =>
          h(Chip, {
            size: 'small',
            label: token.status,
            color: STATUS_COLOR[token.status] ?? 'default',
          }),
      },
      {
        title: 'Actions',
        sorting: false,
        align: 'right',
        render: token =>
          token.status === 'active' &&
          h(
            Button,
            { size: 'small', onClick: () => onRevoke(token) },
            'Revoke',
          ),
      },
    ],
  });
}
