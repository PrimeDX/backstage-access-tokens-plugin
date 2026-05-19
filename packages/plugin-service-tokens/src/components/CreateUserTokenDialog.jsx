import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import FileCopyIcon from '@material-ui/icons/FileCopy';

import {
  defaultUserTokenExpiry,
  isValidMintResultMessage,
  validateUserTokenExpiry,
  validateUserTokenName,
} from '../userTokensHelpers.js';

const h = React.createElement;

/**
 * Dual-mode dialog used for the create flow:
 *   - "form" mode: collect name + optional expiry, kick off the OAuth dance.
 *   - "result" mode: render the show-once raw refresh token with a copy
 *     button. Closing the dialog discards the token from React state.
 *
 * The popup window is launched by this component when the form is
 * submitted; this component also installs a `message` listener bound to
 * the active flowId so it can advance to "result" mode when the backend
 * callback posts the result.
 */
export function CreateUserTokenDialog({
  open = false,
  onSubmit, // ({ name, expiresAt }) => Promise<{ flowId, authorizeUrl }>
  onSuccess = () => {},
  onClose = () => {},
}) {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultUserTokenExpiry());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { token, metadata }
  const flowRef = useRef({ flowId: null, popup: null });

  useEffect(() => {
    if (!open) {
      // Reset on close
      setName('');
      setExpiresAt(defaultUserTokenExpiry());
      setSubmitting(false);
      setError(null);
      setResult(null);
      flowRef.current = { flowId: null, popup: null };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onMessage(event) {
      if (
        !isValidMintResultMessage(event, {
          expectedOrigin: window.location.origin,
          expectedFlowId: flowRef.current.flowId,
        })
      ) {
        return;
      }
      setResult({ token: event.data.token, metadata: event.data.metadata });
      setSubmitting(false);
      onSuccess(event.data.metadata);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, onSuccess]);

  const nameError = name ? validateUserTokenName(name) : null;
  const expiryError = expiresAt ? validateUserTokenExpiry(expiresAt) : null;
  const canSubmit = !nameError && !expiryError && name.trim() && !submitting && !result;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const init = await onSubmit({
        name: name.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      flowRef.current.flowId = init.flowId;
      const popup = window.open(init.authorizeUrl, 'user-tokens-mint', 'width=540,height=720');
      if (!popup) {
        throw new Error('Popup was blocked. Allow popups for this site and try again.');
      }
      flowRef.current.popup = popup;
    } catch (err) {
      setError(err?.message ?? 'Failed to start mint flow');
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!result?.token) return;
    try {
      await navigator.clipboard.writeText(result.token);
    } catch {
      /* best effort */
    }
  }

  // ---- render ----

  if (result) {
    return h(
      Dialog,
      { open, onClose, maxWidth: 'sm', fullWidth: true },
      h(DialogTitle, null, 'Token created'),
      h(
        DialogContent,
        null,
        h(
          Alert,
          { severity: 'warning', style: { marginBottom: 12 } },
          'This token will not be shown again. Copy it now and store it somewhere safe.',
        ),
        h(
          Box,
          { display: 'flex', alignItems: 'center', gridGap: 8 },
          h(TextField, {
            fullWidth: true,
            variant: 'outlined',
            size: 'small',
            value: result.token,
            inputProps: { readOnly: true, 'aria-label': 'token value' },
          }),
          h(
            IconButton,
            { onClick: handleCopy, 'aria-label': 'copy token' },
            h(FileCopyIcon, null),
          ),
        ),
        h(
          Typography,
          { variant: 'caption', color: 'textSecondary', component: 'p', style: { marginTop: 12 } },
          `Token "${result.metadata.name}" · expires ${result.metadata.expiresAt}`,
        ),
      ),
      h(
        DialogActions,
        null,
        h(Button, { onClick: onClose, color: 'primary' }, 'Close'),
      ),
    );
  }

  return h(
    Dialog,
    { open, onClose: submitting ? undefined : onClose, maxWidth: 'sm', fullWidth: true },
    h(DialogTitle, null, 'Create personal access token'),
    h(
      DialogContent,
      null,
      error && h(Alert, { severity: 'error', style: { marginBottom: 12 } }, error),
      h(TextField, {
        fullWidth: true,
        autoFocus: true,
        margin: 'normal',
        label: 'Name',
        value: name,
        onChange: e => setName(e.target.value),
        error: !!nameError,
        helperText: nameError ?? 'A short label so you remember what this token is for.',
        disabled: submitting,
      }),
      h(TextField, {
        fullWidth: true,
        margin: 'normal',
        label: 'Expires (optional)',
        type: 'datetime-local',
        value: expiresAt,
        onChange: e => setExpiresAt(e.target.value),
        error: !!expiryError,
        helperText:
          expiryError ?? 'Leave blank to use the server default (typically 30 days).',
        InputLabelProps: { shrink: true },
        disabled: submitting,
      }),
      submitting &&
        h(
          Typography,
          { variant: 'body2', color: 'textSecondary', style: { marginTop: 12 } },
          'Authorize the request in the popup window to receive your token.',
        ),
    ),
    h(
      DialogActions,
      null,
      h(Button, { onClick: onClose, disabled: submitting }, 'Cancel'),
      h(
        Button,
        { onClick: handleSubmit, color: 'primary', variant: 'contained', disabled: !canSubmit },
        submitting ? 'Awaiting authorization…' : 'Create',
      ),
    ),
  );
}
