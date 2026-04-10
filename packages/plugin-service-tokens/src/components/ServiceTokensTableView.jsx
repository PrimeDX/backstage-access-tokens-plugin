import React from 'react';
import {
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import {
  formatRelativeTime,
  getStatusChipColor,
  getStatusLabel,
} from '../helpers.js';

const h = React.createElement;

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

  return h(
    Table,
    { size: 'small' },
    h(
      TableHead,
      null,
      h(
        TableRow,
        null,
        h(TableCell, null, 'Name'),
        h(TableCell, null, 'Group'),
        h(TableCell, null, 'Scopes'),
        h(TableCell, null, 'Status'),
        h(TableCell, null, 'Expires'),
        h(TableCell, null, 'Last used'),
        h(TableCell, null, 'Created by'),
        h(TableCell, null, 'Actions'),
      ),
    ),
    h(
      TableBody,
      null,
      ...tokens.map(token =>
        h(
          TableRow,
          { key: token.id, hover: true },
          h(
            TableCell,
            null,
            h(Typography, { variant: 'body2' }, token.name),
            h(Typography, { variant: 'caption', color: 'textSecondary' }, token.description),
            h(
              Typography,
              { variant: 'caption', display: 'block', color: 'textSecondary' },
              `Prefix: ${token.tokenPrefix}`,
            ),
          ),
          h(TableCell, null, token.groupEntityRef),
          h(TableCell, null, token.scopes.join(', ')),
          h(
            TableCell,
            null,
            h(Chip, {
              size: 'small',
              color: getStatusChipColor(token.status),
              label: getStatusLabel(token.status),
            }),
          ),
          h(
            TableCell,
            { title: token.expiresAt },
            formatRelativeTime(token.expiresAt, now),
          ),
          h(
            TableCell,
            { title: token.lastUsedAt ?? '' },
            formatRelativeTime(token.lastUsedAt, now),
          ),
          h(TableCell, null, token.createdBy),
          h(
            TableCell,
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
        ),
      ),
    ),
  );
}
