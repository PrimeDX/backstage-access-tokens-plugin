import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';

const h = React.createElement;

/**
 * Confirmation dialog for revoking one user token. Calls `onConfirm`
 * once and shows a spinner-style label while the request is in flight.
 */
export function RevokeUserTokenDialog({
  open = false,
  token = null,
  revoking = false,
  error = null,
  onConfirm = () => {},
  onClose = () => {},
}) {
  if (!token) {
    return null;
  }
  return h(
    Dialog,
    { open, onClose: revoking ? undefined : onClose, maxWidth: 'sm', fullWidth: true },
    h(DialogTitle, null, `Revoke "${token.name}"?`),
    h(
      DialogContent,
      null,
      error && h(Alert, { severity: 'error', style: { marginBottom: 12 } }, error),
      h(
        Typography,
        { variant: 'body2' },
        'This will immediately invalidate the token. Any scripts using it will start receiving 401 responses. This action cannot be undone.',
      ),
    ),
    h(
      DialogActions,
      null,
      h(Button, { onClick: onClose, disabled: revoking }, 'Cancel'),
      h(
        Button,
        {
          onClick: onConfirm,
          color: 'secondary',
          variant: 'contained',
          disabled: revoking,
        },
        revoking ? 'Revoking…' : 'Revoke',
      ),
    ),
  );
}
