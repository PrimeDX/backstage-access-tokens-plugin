import React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@material-ui/core';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import {
  isCreateFormValid,
  validateName,
  validateDescription,
  validateExpiresAt,
} from '../helpers.js';

const h = React.createElement;

function ScopeCheckboxes({ scopes, selectedScopes, onFormChange, touched }) {
  const hasError = touched && selectedScopes.length === 0;

  return h(
    Box,
    { mt: 1 },
    h(Typography, { variant: 'subtitle2', gutterBottom: true }, 'Permissions'),
    h(
      FormGroup,
      null,
      ...scopes.map(scope =>
        h(
          Box,
          { key: scope.id, mb: 0.5 },
          h(
            FormControlLabel,
            {
              control: h(Checkbox, {
                size: 'small',
                checked: selectedScopes.includes(scope.id),
                onChange: e => {
                  const next = e.target.checked
                    ? [...selectedScopes, scope.id]
                    : selectedScopes.filter(s => s !== scope.id);
                  onFormChange('scopes', next);
                },
              }),
              label: h(
                Box,
                null,
                h(Typography, { variant: 'body2' }, scope.label),
                h(
                  Typography,
                  { variant: 'caption', color: 'textSecondary', display: 'block' },
                  scope.description,
                ),
              ),
            },
          ),
        ),
      ),
    ),
    hasError &&
      h(
        FormHelperText,
        { error: true },
        'Select at least one scope',
      ),
  );
}

function FormStep({ scopes, groupOptions, form, onFormChange, onSubmit, onClose, submitting, submitError, touched, onTouch }) {
  const valid = isCreateFormValid(form);
  const scopesTouched = touched.scopes;

  const nameError = touched.name ? validateName(form.name) : null;
  const descError = touched.description ? validateDescription(form.description) : null;
  const expiryError = touched.expiresAt ? validateExpiresAt(form.expiresAt) : null;

  const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return h(
    React.Fragment,
    null,
    h(DialogTitle, null, 'Create service token'),
    h(
      DialogContent,
      null,
      h(
        Box,
        { display: 'flex', flexDirection: 'column', gap: 2, pt: 1 },
        submitError &&
          h(
            FormHelperText,
            { error: true, style: { fontSize: '0.875rem', marginBottom: 4 } },
            submitError,
          ),
        h(TextField, {
          label: 'Name',
          required: true,
          size: 'small',
          fullWidth: true,
          value: form.name,
          onChange: e => {
            onTouch('name');
            onFormChange('name', e.target.value);
          },
          onBlur: () => onTouch('name'),
          error: Boolean(nameError),
          helperText: nameError ?? 'Short identifier, e.g. deploy-bot (lowercase, numbers, hyphens only)',
          disabled: submitting,
          inputProps: { maxLength: 100 },
        }),
        h(TextField, {
          label: 'Description',
          required: true,
          size: 'small',
          fullWidth: true,
          multiline: true,
          rows: 2,
          value: form.description,
          onChange: e => {
            onTouch('description');
            onFormChange('description', e.target.value);
          },
          onBlur: () => onTouch('description'),
          error: Boolean(descError),
          helperText: descError ?? 'What is this token used for?',
          disabled: submitting,
          inputProps: { maxLength: 500 },
        }),
        h(
          TextField,
          {
            select: true,
            label: 'Owning group',
            required: true,
            size: 'small',
            fullWidth: true,
            value: form.groupEntityRef,
            onChange: e => {
              onTouch('groupEntityRef');
              onFormChange('groupEntityRef', e.target.value);
            },
            disabled: submitting,
          },
          h(MenuItem, { value: '' }, h('em', null, 'Select a group…')),
          ...groupOptions.map(opt =>
            h(
              MenuItem,
              { key: opt.value, value: opt.value },
              h(
                Box,
                null,
                h(Typography, { variant: 'body2' }, opt.label),
                opt.description &&
                  h(
                    Typography,
                    { variant: 'caption', color: 'textSecondary', display: 'block' },
                    opt.description,
                  ),
              ),
            ),
          ),
        ),
        h(ScopeCheckboxes, {
          scopes,
          selectedScopes: form.scopes,
          onFormChange: (field, value) => {
            onTouch('scopes');
            onFormChange(field, value);
          },
          touched: scopesTouched,
        }),
        h(TextField, {
          label: 'Expiry date',
          type: 'date',
          required: true,
          size: 'small',
          fullWidth: true,
          value: form.expiresAt,
          onChange: e => {
            onTouch('expiresAt');
            onFormChange('expiresAt', e.target.value);
          },
          onBlur: () => onTouch('expiresAt'),
          error: Boolean(expiryError),
          helperText: expiryError ?? 'Defaults to 30 days from today',
          disabled: submitting,
          InputLabelProps: { shrink: true },
          inputProps: { min: minDate },
        }),
      ),
    ),
    h(
      DialogActions,
      null,
      h(
        Button,
        { onClick: onClose, disabled: submitting },
        'Cancel',
      ),
      h(
        Button,
        {
          variant: 'contained',
          color: 'primary',
          disabled: !valid || submitting,
          onClick: onSubmit,
          startIcon: submitting ? h(CircularProgress, { size: 16, color: 'inherit' }) : undefined,
        },
        submitting ? 'Creating…' : 'Create token',
      ),
    ),
  );
}

function SuccessStep({ createdToken, onClose }) {
  const [copied, setCopied] = React.useState(false);

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(createdToken.rawToken).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return h(
    React.Fragment,
    null,
    h(DialogTitle, null, 'Token created'),
    h(
      DialogContent,
      null,
      h(
        Box,
        { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 1 },
        h(CheckCircleOutlineIcon, { style: { fontSize: 48, color: '#4caf50' } }),
        h(
          Typography,
          { variant: 'body1', align: 'center' },
          'Copy this token now. It will ',
          h('strong', null, 'not'),
          ' be shown again.',
        ),
        h(
          Paper,
          { variant: 'outlined', style: { width: '100%', padding: '8px 12px' } },
          h(
            Box,
            { display: 'flex', alignItems: 'center', gap: 1 },
            h(
              Typography,
              {
                variant: 'body2',
                style: {
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  flex: 1,
                },
              },
              createdToken.rawToken,
            ),
            h(
              Tooltip,
              { title: copied ? 'Copied!' : 'Copy to clipboard' },
              h(
                IconButton,
                { size: 'small', onClick: handleCopy },
                h(FileCopyOutlinedIcon, { fontSize: 'small' }),
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      DialogActions,
      null,
      h(
        Button,
        { variant: 'contained', color: 'primary', onClick: onClose },
        'Done',
      ),
    ),
  );
}

export function CreateTokenDialog({
  open = false,
  scopes = [],
  groupOptions = [],
  form = { name: '', description: '', groupEntityRef: '', scopes: [], expiresAt: '' },
  onFormChange = () => {},
  onSubmit = () => {},
  onClose = () => {},
  submitting = false,
  createdToken = null,
  submitError = null,
}) {
  const [touched, setTouched] = React.useState({});

  function handleTouch(field) {
    setTouched(prev => ({ ...prev, [field]: true }));
  }

  // Reset touched state when dialog closes/reopens
  React.useEffect(() => {
    if (!open) {
      setTouched({});
    }
  }, [open]);

  return h(
    Dialog,
    { open, onClose: createdToken ? onClose : undefined, maxWidth: 'sm', fullWidth: true },
    createdToken
      ? h(SuccessStep, { createdToken, onClose })
      : h(FormStep, {
          scopes,
          groupOptions,
          form,
          onFormChange,
          onSubmit,
          onClose,
          submitting,
          submitError,
          touched,
          onTouch: handleTouch,
        }),
  );
}
