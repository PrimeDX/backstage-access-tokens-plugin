import React from 'react';
import {
  Box,
  Button,
  Chip,
  Typography,
} from '@material-ui/core';
import { Progress, Table as BackstageTable } from '@backstage/core-components';
import {
  formatEntityRefForDisplay,
  formatDateTime,
  formatRelativeTime,
  getStatusChipColor,
  getStatusLabel,
} from '../helpers.js';

const h = React.createElement;

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

function tokenToTableRow(token, now) {
  const scopes = token.scopes.join(', ');
  const statusLabel = getStatusLabel(token.status);

  return {
    ...token,
    groupEntityRefDisplay: formatEntityRefForDisplay(token.groupEntityRef),
    createdByDisplay: formatEntityRefForDisplay(token.createdBy),
    scopesText: scopes,
    statusLabel,
    expiresAtFormatted: formatDateTime(token.expiresAt),
    lastUsedAtRelative: formatRelativeTime(token.lastUsedAt, now),
    createdAtFormatted: formatDateTime(token.createdAt),
  };
}

export function ServiceTokensTableView({
  loading = false,
  now,
  tokens = [],
  onAudit = () => {},
  onRevoke = () => {},
}) {
  if (loading) {
    return h(Progress);
  }

  if (tokens.length === 0) {
    return h(
      Box,
      { py: 4 },
      h(Typography, { variant: 'h6' }, 'No service tokens yet'),
      h(
        Typography,
        { variant: 'body2', color: 'textSecondary' },
        'Create the first token to give a service principal access to Backstage APIs.',
      ),
    );
  }

  const rows = tokens
    .map(token => tokenToTableRow(token, now))
    .sort((left, right) => compareDates(right, left, 'createdAt'));

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
        render: token =>
          h(
            Box,
            null,
            h(Typography, { variant: 'body2' }, token.name),
            h(Typography, { variant: 'caption', color: 'textSecondary' }, token.description),
            h(
              Typography,
              { variant: 'caption', display: 'block', color: 'textSecondary' },
              `Prefix: ${token.tokenPrefix}`,
            ),
          ),
      },
      {
        title: 'Group',
        field: 'groupEntityRefDisplay',
        customSort: (left, right) =>
          compareStrings(left.groupEntityRefDisplay, right.groupEntityRefDisplay),
        render: token =>
          h(
            'span',
            { title: token.groupEntityRef },
            token.groupEntityRefDisplay,
          ),
      },
      {
        title: 'Scopes',
        field: 'scopesText',
        cellStyle: { whiteSpace: 'normal', wordBreak: 'break-word' },
      },
      {
        title: 'Status',
        field: 'statusLabel',
        render: token =>
          h(Chip, {
            size: 'small',
            color: getStatusChipColor(token.status),
            label: token.statusLabel,
          }),
      },
      {
        title: 'Expires',
        field: 'expiresAt',
        customSort: (left, right) => compareDates(left, right, 'expiresAt'),
        render: token =>
          h(
            'span',
            { title: token.expiresAt },
            token.expiresAtFormatted,
          ),
      },
      {
        title: 'Last used',
        field: 'lastUsedAt',
        customSort: (left, right) => compareDates(left, right, 'lastUsedAt'),
        render: token =>
          h(
            'span',
            { title: token.lastUsedAt ?? '' },
            token.lastUsedAtRelative,
          ),
      },
      {
        title: 'Created',
        field: 'createdAt',
        customSort: (left, right) => compareDates(left, right, 'createdAt'),
        render: token =>
          h(
            'span',
            { title: token.createdAt ?? '' },
            token.createdAtFormatted,
          ),
      },
      {
        title: 'Created by',
        field: 'createdByDisplay',
        customSort: (left, right) =>
          compareStrings(left.createdByDisplay, right.createdByDisplay),
        render: token =>
          h(
            'span',
            { title: token.createdBy },
            token.createdByDisplay,
          ),
      },
      {
        title: 'Actions',
        sorting: false,
        render: token =>
          h(
            React.Fragment,
            null,
            h(
              Button,
              {
                size: 'small',
                onClick: () => onAudit(token),
              },
              'Audit',
            ),
            h(
              Button,
              {
                size: 'small',
                color: 'secondary',
                disabled: token.status === 'revoked',
                onClick: () => onRevoke(token),
              },
              'Revoke',
            ),
          ),
      },
    ],
  });
}
