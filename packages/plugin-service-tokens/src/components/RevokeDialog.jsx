import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormHelperText,
  Paper,
  TextField,
  Typography,
} from '@material-ui/core';
import WarningIcon from '@material-ui/icons/Warning';

const h = React.createElement;

export function RevokeDialog({
  open = false,
  token = null,
  reason = '',
  onReasonChange = () => {},
  onConfirm = () => {},
  onClose = () => {},
  revoking = false,
  submitError = null,
}) {
  const [touched, setTouched] = React.useState(false);

  // Reset touched when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setTouched(false);
    }
  }, [open]);

  const reasonError = touched && reason.trim().length === 0
    ? 'Reason is required'
    : touched && reason.trim().length > 500
    ? 'Reason must be 500 characters or fewer'
    : null;

  const isValid = reason.trim().length >= 1 && reason.trim().length <= 500;

  return h(
    Dialog,
    { open, onClose: revoking ? undefined : onClose, maxWidth: 'sm', fullWidth: true },
    h(
      DialogTitle,
      null,
      h(
        Box,
        { display: 'flex', alignItems: 'center', gap: 1 },
        h(WarningIcon, { style: { color: '#f57c00' } }),
        'Revoke token?',
      ),
    ),
    h(
      DialogContent,
      null,
      h(
        Box,
        { display: 'flex', flexDirection: 'column', gap: 2 },
        h(
          Typography,
          { variant: 'body2', color: 'textSecondary' },
          'This action cannot be undone. Services using this token lose access after revocation propagates through the configured cache TTL.',
        ),
        token &&
          h(
            Paper,
            { variant: 'outlined', style: { padding: '12px 16px' } },
            h(
              Box,
              { display: 'flex', flexDirection: 'column', gap: 0.5 },
              h(Typography, { variant: 'subtitle2' }, token.name),
              h(
                Typography,
                { variant: 'body2', color: 'textSecondary' },
                token.groupEntityRef,
              ),
              token.tokenPrefix &&
                h(
                  Typography,
                  { variant: 'caption', color: 'textSecondary' },
                  `Prefix: ${token.tokenPrefix}`,
                ),
            ),
          ),
        submitError &&
          h(
            FormHelperText,
            { error: true, style: { fontSize: '0.875rem' } },
            submitError,
          ),
        h(TextField, {
          label: 'Reason for revocation',
          required: true,
          size: 'small',
          fullWidth: true,
          multiline: true,
          rows: 2,
          value: reason,
          onChange: e => {
            setTouched(true);
            onReasonChange(e.target.value);
          },
          onBlur: () => setTouched(true),
          error: Boolean(reasonError),
          helperText: reasonError ?? 'Required — recorded in the audit log.',
          placeholder: 'e.g. Credential rotation, security incident',
          disabled: revoking,
          inputProps: { maxLength: 500 },
        }),
      ),
    ),
    h(
      DialogActions,
      null,
      h(
        Button,
        { onClick: onClose, disabled: revoking },
        'Cancel',
      ),
      h(
        Button,
        {
          variant: 'contained',
          color: 'secondary',
          disabled: revoking || !isValid,
          onClick: () => {
            setTouched(true);
            if (isValid) onConfirm();
          },
          startIcon: revoking ? h(CircularProgress, { size: 16, color: 'inherit' }) : undefined,
        },
        revoking ? 'Revoking…' : 'Revoke',
      ),
    ),
  );
}
