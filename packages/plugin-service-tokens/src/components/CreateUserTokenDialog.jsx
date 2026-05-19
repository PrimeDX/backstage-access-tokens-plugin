import React, { useEffect, useState } from 'react';
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
  validateUserTokenExpiry,
  validateUserTokenName,
} from '../userTokensHelpers.js';

const h = React.createElement;

/**
 * Dual-mode dialog used for the create flow:
 *   - "form" mode: collect name + optional expiry, kick off the OAuth
 *     dance by navigating the entire window to the authorize URL.
 *   - "result" mode: render the show-once raw refresh token with a copy
 *     button. Entered when the parent passes a `prefilledResult` prop —
 *     this happens after the page reloads with a #user-tokens-mint
 *     fragment, decoded by UserTokensPage.
 *
 * Navigation is same-tab (window.location.href). When the user returns
 * from the OAuth dance, the page reloads, the page detects the result
 * fragment, and opens this dialog directly in result mode.
 */
export function CreateUserTokenDialog({
  open = false,
  // When provided, the dialog opens in result mode showing this
  // token + metadata (used by the page after detecting the post-auth
  // redirect fragment). When null, the dialog opens in form mode.
  prefilledResult = null,
  onSubmit, // ({ name, expiresAt }) => Promise<{ flowId, authorizeUrl }>
  onClose = () => {},
}) {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultUserTokenExpiry());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setExpiresAt(defaultUserTokenExpiry());
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const nameError = name ? validateUserTokenName(name) : null;
  const expiryError = expiresAt ? validateUserTokenExpiry(expiresAt) : null;
  const canSubmit = !nameError && !expiryError && name.trim() && !submitting;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const init = await onSubmit({
        name: name.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      if (!init?.authorizeUrl) {
        throw new Error('Mint endpoint did not return an authorizeUrl');
      }
      // Same-tab navigation. The user goes through Backstage's consent
      // page; after authorize the callback redirects the page back to
      // /settings/personal-tokens#user-tokens-mint=<payload>, the page
      // detects the fragment, and this dialog reopens in result mode.
      window.location.href = init.authorizeUrl;
    } catch (err) {
      setError(err?.message ?? 'Failed to start mint flow');
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!prefilledResult?.token) return;
    try {
      await navigator.clipboard.writeText(prefilledResult.token);
    } catch {
      /* best effort */
    }
  }

  // ---- render ----

  if (prefilledResult) {
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
            value: prefilledResult.token,
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
          {
            variant: 'caption',
            color: 'textSecondary',
            component: 'p',
            style: { marginTop: 12 },
          },
          `Token "${prefilledResult.metadata.name}" · expires ${prefilledResult.metadata.expiresAt}`,
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
          'Redirecting to the authorization page…',
        ),
    ),
    h(
      DialogActions,
      null,
      h(Button, { onClick: onClose, disabled: submitting }, 'Cancel'),
      h(
        Button,
        { onClick: handleSubmit, color: 'primary', variant: 'contained', disabled: !canSubmit },
        submitting ? 'Redirecting…' : 'Create',
      ),
    ),
  );
}
