import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import AppsIcon from '@material-ui/icons/Apps';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import CloseIcon from '@material-ui/icons/Close';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import VpnKeyIcon from '@material-ui/icons/VpnKey';
import { Route, Routes, useParams } from 'react-router-dom';
import {
  alertApiRef,
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';

import { buildConsentCopy } from './userTokensConsentHelpers.js';

const h = React.createElement;

const useStyles = makeStyles(theme => ({
  root: {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    background: theme.palette.background.default,
    paddingTop: theme.spacing(6),
    paddingBottom: theme.spacing(6),
  },
  card: {
    maxWidth: 640,
    margin: '0 auto',
    padding: theme.spacing(3),
    borderRadius: 8,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.palette.primary.main,
    backgroundColor: theme.palette.action.hover,
    flexShrink: 0,
  },
  detail: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(1.5),
    borderRadius: 6,
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    overflowWrap: 'anywhere',
    fontFamily: theme.typography.fontFamily,
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    marginTop: theme.spacing(3),
  },
  centered: {
    textAlign: 'center',
  },
  statusIcon: {
    fontSize: 56,
    marginBottom: theme.spacing(2),
  },
  error: {
    color: theme.palette.error.main,
  },
}));

async function parseError(response) {
  const text = await response.text().catch(() => '');
  return text || `${response.status} ${response.statusText}`.trim();
}

function ConsentLayout({ children }) {
  const classes = useStyles();
  return h(
    Box,
    { className: classes.root },
    h(
      Container,
      { maxWidth: 'md' },
      h(Paper, { elevation: 1, className: classes.card }, children),
    ),
  );
}

function ConsentError({ title, message }) {
  const classes = useStyles();
  return h(
    ConsentLayout,
    null,
    h(
      Box,
      { className: classes.centered },
      h(ErrorOutlineIcon, { className: `${classes.statusIcon} ${classes.error}` }),
      h(Typography, { variant: 'h5', component: 'h1', gutterBottom: true }, title),
      h(Typography, { color: 'textSecondary' }, message),
    ),
  );
}

function UserTokensConsentPage() {
  const { sessionId } = useParams();
  const classes = useStyles();
  const alertApi = useApi(alertApiRef);
  const configApi = useApi(configApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const appTitle = configApi.getOptionalString('app.title') ?? 'Backstage';

  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(null);
  const [completedAction, setCompletedAction] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setLoadError('The consent request ID is missing.');
      setLoading(false);
      return () => {};
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const baseUrl = await discoveryApi.getBaseUrl('auth');
        const response = await fetchApi.fetch(`${baseUrl}/v1/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error(`Authorization request could not be loaded: ${await parseError(response)}`);
        }
        const body = await response.json();
        if (!cancelled) setSession(body);
      } catch (err) {
        if (!cancelled) setLoadError(err?.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, sessionId]);

  const handleAction = useCallback(
    async action => {
      if (!session) return;
      setSubmittingAction(action);
      try {
        const baseUrl = await discoveryApi.getBaseUrl('auth');
        const response = await fetchApi.fetch(
          `${baseUrl}/v1/sessions/${session.id}/${action}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
        );
        if (!response.ok) {
          throw new Error(`Authorization request failed: ${await parseError(response)}`);
        }
        const body = await response.json();
        setCompletedAction(action);
        if (body?.redirectUrl) {
          window.location.href = body.redirectUrl;
        }
      } catch (err) {
        const message = err?.message ?? String(err);
        alertApi.post({ message, severity: 'error' });
        setLoadError(message);
      } finally {
        setSubmittingAction(null);
      }
    },
    [alertApi, discoveryApi, fetchApi, session],
  );

  if (loading) {
    return h(
      ConsentLayout,
      null,
      h(
        Box,
        { className: classes.centered },
        h(CircularProgress, { size: 32 }),
        h(
          Typography,
          { color: 'textSecondary', style: { marginTop: 16 } },
          'Loading authorization request...',
        ),
      ),
    );
  }

  if (loadError) {
    return h(ConsentError, {
      title: 'Authorization request unavailable',
      message: loadError,
    });
  }

  if (completedAction) {
    const copy = buildConsentCopy(session, appTitle);
    const CompletedIcon =
      completedAction === 'approve' ? CheckCircleOutlineIcon : CloseIcon;
    return h(
      ConsentLayout,
      null,
      h(
        Box,
        { className: classes.centered },
        h(CompletedIcon, {
          className: classes.statusIcon,
          color: completedAction === 'approve' ? 'primary' : 'disabled',
        }),
        h(
          Typography,
          { variant: 'h5', component: 'h1', gutterBottom: true },
          completedAction === 'approve' ? copy.approvedTitle : copy.rejectedTitle,
        ),
        h(Typography, { color: 'textSecondary' }, 'Redirecting...'),
      ),
    );
  }

  const copy = buildConsentCopy(session, appTitle);
  const isSubmitting = !!submittingAction;
  const Icon = copy.kind === 'user-tokens' ? VpnKeyIcon : AppsIcon;

  return h(
    ConsentLayout,
    null,
    h(
      Box,
      { className: classes.header },
      h(Box, { className: classes.icon }, h(Icon, null)),
      h(
        Box,
        null,
        h(Typography, { variant: 'h5', component: 'h1' }, copy.title),
        h(Typography, { color: 'textSecondary' }, copy.subtitle),
      ),
    ),
    h(Divider, { style: { margin: '20px 0' } }),
    h(Typography, { variant: 'body1' }, copy.body),
    copy.detailValue &&
      h(
        Box,
        { className: classes.detail },
        h(
          Typography,
          { variant: 'caption', color: 'textSecondary', component: 'div' },
          copy.detailLabel,
        ),
        h(Typography, { variant: 'body2' }, copy.detailValue),
      ),
    h(
      Box,
      { className: classes.actions },
      h(
        Button,
        {
          variant: 'outlined',
          disabled: isSubmitting,
          startIcon: h(CloseIcon, null),
          onClick: () => handleAction('reject'),
        },
        copy.cancelLabel,
      ),
      h(
        Button,
        {
          variant: 'contained',
          color: 'primary',
          disabled: isSubmitting,
          startIcon: h(CheckCircleOutlineIcon, null),
          onClick: () => handleAction('approve'),
        },
        submittingAction === 'approve' ? copy.approvingLabel : copy.approveLabel,
      ),
    ),
  );
}

export function UserTokensConsentRouter() {
  return h(
    Routes,
    null,
    h(Route, {
      path: '/authorize/:sessionId',
      element: h(UserTokensConsentPage),
    }),
  );
}
