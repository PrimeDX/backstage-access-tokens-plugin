import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { Content, Header, Page } from '@backstage/core-components';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

import { CreateUserTokenDialog } from './components/CreateUserTokenDialog.jsx';
import { RevokeUserTokenDialog } from './components/RevokeUserTokenDialog.jsx';
import { UserTokensTableView } from './components/UserTokensTableView.jsx';
import { parseMintResultFragment } from './userTokensHelpers.js';

const h = React.createElement;

export function UserTokensPage() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [baseUrl, setBaseUrl] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Non-null only after a same-tab post-OAuth redirect; opens the
  // dialog directly in result mode with the captured token.
  const [prefilledResult, setPrefilledResult] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState(null);
  // Error fragment from a failed mint (state mismatch, OAuth error).
  const [mintError, setMintError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await discoveryApi.getBaseUrl('service-tokens');
      if (!cancelled) setBaseUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi]);

  // Detect a post-OAuth redirect. The backend mint callback redirects
  // the same browsing context to /settings/personal-tokens with either
  //   #user-tokens-mint=<base64-payload> on success, or
  //   #user-tokens-mint-error=<base64-detail> on failure.
  // Decode + consume + clear the fragment so refresh doesn't replay.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash) return;

    const result = parseMintResultFragment(hash);
    if (result) {
      setPrefilledResult({ token: result.token, metadata: result.metadata });
      setCreateOpen(true);
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {}
      return;
    }

    const errorPrefix = '#user-tokens-mint-error=';
    if (hash.startsWith(errorPrefix)) {
      const encoded = hash.slice(errorPrefix.length);
      let detail = 'Token creation failed.';
      try {
        const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
        const parsed = JSON.parse(decoded);
        if (parsed?.message) detail = parsed.message;
      } catch {}
      setMintError(detail);
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {}
    }
  }, []);

  const reload = useCallback(async () => {
    if (!baseUrl) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchApi.fetch(`${baseUrl}/personal/tokens`);
      if (!res.ok) {
        throw new Error(`Failed to load tokens (${res.status})`);
      }
      const body = await res.json();
      setTokens(body.tokens ?? []);
    } catch (err) {
      setLoadError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, fetchApi]);

  useEffect(() => {
    if (baseUrl) reload();
  }, [baseUrl, reload]);

  const onMintSubmit = useCallback(
    async input => {
      const res = await fetchApi.fetch(`${baseUrl}/personal/tokens/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? `Mint failed (${res.status})`);
      }
      return res.json();
    },
    [baseUrl, fetchApi],
  );

  const onCreateClose = useCallback(() => {
    setCreateOpen(false);
    setPrefilledResult(null);
  }, []);

  const onRevokeConfirm = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const res = await fetchApi.fetch(
        `${baseUrl}/personal/tokens/${encodeURIComponent(revokeTarget.id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok && res.status !== 204) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? `Revoke failed (${res.status})`);
      }
      setRevokeTarget(null);
      await reload();
    } catch (err) {
      setRevokeError(err?.message ?? String(err));
    } finally {
      setRevoking(false);
    }
  }, [baseUrl, fetchApi, revokeTarget, reload]);

  return h(
    Page,
    { themeId: 'tool' },
    h(Header, { title: 'Personal access tokens', subtitle: 'Tokens that authenticate as you' }),
    h(
      Content,
      null,
      mintError &&
        h(
          Alert,
          {
            severity: 'error',
            onClose: () => setMintError(null),
            style: { marginBottom: 12 },
          },
          mintError,
        ),
      h(
        Box,
        { display: 'flex', justifyContent: 'flex-end', mb: 2 },
        h(
          Button,
          { variant: 'contained', color: 'primary', onClick: () => setCreateOpen(true) },
          'Create token',
        ),
      ),
      loading
        ? h(CircularProgress, null)
        : loadError
        ? h('div', { style: { color: 'red' } }, `Error: ${loadError}`)
        : h(UserTokensTableView, {
            tokens,
            onRevoke: token => setRevokeTarget(token),
          }),
      h(CreateUserTokenDialog, {
        open: createOpen,
        prefilledResult,
        onSubmit: onMintSubmit,
        onClose: onCreateClose,
      }),
      h(RevokeUserTokenDialog, {
        open: !!revokeTarget,
        token: revokeTarget,
        revoking,
        error: revokeError,
        onConfirm: onRevokeConfirm,
        onClose: () => {
          setRevokeTarget(null);
          setRevokeError(null);
        },
      }),
    ),
  );
}
