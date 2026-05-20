import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import HistoryIcon from '@material-ui/icons/History';
import { formatDateTime } from '../helpers.js';

const h = React.createElement;

const EVENT_CHIP_COLORS = {
  created: '#1976d2',
  used: '#757575',
  revoked: '#d32f2f',
};

function EventChip({ event }) {
  const color = EVENT_CHIP_COLORS[event] ?? '#757575';
  return h(Chip, {
    size: 'small',
    label: event,
    style: { backgroundColor: color, color: '#fff', fontWeight: 500 },
  });
}

export function AuditLogDialog({
  open = false,
  token = null,
  entries = [],
  loading = false,
  onClose = () => {},
}) {
  const title = token ? `Audit log — ${token.name}` : 'Audit log';

  return h(
    Dialog,
    { open, onClose, maxWidth: 'md', fullWidth: true },
    h(
      DialogTitle,
      null,
      h(
        Box,
        { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        title,
        h(
          IconButton,
          { size: 'small', onClick: onClose, 'aria-label': 'close' },
          h(CloseIcon, { fontSize: 'small' }),
        ),
      ),
    ),
    h(
      DialogContent,
      { style: { maxHeight: 400, overflow: 'auto' } },
      loading
        ? h(
            Box,
            { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 120 },
            h(CircularProgress),
          )
        : entries.length === 0
        ? h(
            Box,
            {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 120,
              gap: 1,
            },
            h(HistoryIcon, { style: { fontSize: 40, color: '#bdbdbd' } }),
            h(Typography, { variant: 'body1' }, 'No events recorded yet'),
            h(
              Typography,
              { variant: 'caption', color: 'textSecondary', align: 'center' },
              'Events are recorded when a token is created, used, or revoked.',
            ),
          )
        : h(
            Table,
            { size: 'small', stickyHeader: true },
            h(
              TableHead,
              null,
              h(
                TableRow,
                null,
                h(TableCell, null, 'Event'),
                h(TableCell, null, 'Actor'),
                h(TableCell, null, 'Reason'),
                h(TableCell, null, 'Date'),
              ),
            ),
            h(
              TableBody,
              null,
              ...entries.map(entry =>
                h(
                  TableRow,
                  { key: entry.id, hover: true },
                  h(TableCell, null, h(EventChip, { event: entry.event })),
                  h(TableCell, null, entry.actorEntityRef),
                  h(
                    TableCell,
                    null,
                    entry.reason
                      ? entry.reason
                      : h(Typography, { variant: 'body2', color: 'textSecondary' }, '—'),
                  ),
                  h(
                    TableCell,
                    { title: entry.createdAt },
                    formatDateTime(entry.createdAt),
                  ),
                ),
              ),
            ),
          ),
    ),
    h(
      DialogActions,
      null,
      h(Button, { onClick: onClose }, 'Close'),
    ),
  );
}
