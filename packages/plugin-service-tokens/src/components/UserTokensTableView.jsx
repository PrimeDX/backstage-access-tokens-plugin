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

import { formatUserTokenDate } from '../userTokensHelpers.js';

const h = React.createElement;

const STATUS_COLOR = {
  active: 'primary',
  expired: 'default',
  revoked: 'secondary',
};

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
        h(TableCell, null, 'Created'),
        h(TableCell, null, 'Expires'),
        h(TableCell, null, 'Last used'),
        h(TableCell, null, 'Status'),
        h(TableCell, { align: 'right' }, ''),
      ),
    ),
    h(
      TableBody,
      null,
      ...tokens.map(token =>
        h(
          TableRow,
          { key: token.id },
          h(TableCell, null, h(Typography, { variant: 'body2' }, token.name)),
          h(TableCell, null, formatUserTokenDate(token.createdAt)),
          h(TableCell, null, formatUserTokenDate(token.expiresAt)),
          h(TableCell, null, formatUserTokenDate(token.lastUsedAt)),
          h(
            TableCell,
            null,
            h(Chip, {
              size: 'small',
              label: token.status ?? 'active',
              color: STATUS_COLOR[token.status ?? 'active'] ?? 'default',
            }),
          ),
          h(
            TableCell,
            { align: 'right' },
            token.status === 'active' &&
              h(
                Button,
                { size: 'small', onClick: () => onRevoke(token) },
                'Revoke',
              ),
          ),
        ),
      ),
    ),
  );
}
