import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress } from '@material-ui/core';
import { Content, Header, Page } from '@backstage/core-components';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

import { CreateUserTokenDialog } from './components/CreateUserTokenDialog.jsx';
import { RevokeUserTokenDialog } from './components/RevokeUserTokenDialog.jsx';
import { UserTokensTableView } from './components/UserTokensTableView.jsx';

const h = React.createElement;

/** Convert RFC 4648 base64url back to standard base64 for atob(). */
function base64UrlToBase64(input) {
  return input.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    input.length + ((4 - (input.length % 4)) % 4),
    '=',
  );
}

export function UserTokensPage() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [baseUrl, setBaseUrl] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState(null);

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

  // Popup-side handler: the backend's mint callback redirects the popup
  // to this page with #user-tokens-mint=<base64-payload>. Decode and
  // forward to the opener via postMessage, then close. The popup runs
  // the same React app as the parent — this useEffect just lets the
  // popup do its one job and disappear without rendering UI.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#user-tokens-mint=')) return;
    const encoded = hash.slice('#user-tokens-mint='.length);
    let payload;
    try {
      payload = JSON.parse(atob(base64UrlToBase64(encoded)));
    } catch (err) {
      return;
    }
    // Clear the fragment immediately so it doesn't persist in history
    // beyond a single use.
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {}
    if (window.opener) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch {}
      window.close();
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

  const onMintSuccess = useCallback(async () => {
    await reload();
  }, [reload]);

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
        // The popup redirects to this same frontend page on completion
        // (see useEffect above), so the postMessage arrives from the
        // frontend origin — same as window.location.origin which is
        // the dialog's default. No expectedMessageOrigin override.
        onSubmit: onMintSubmit,
        onSuccess: onMintSuccess,
        onClose: () => setCreateOpen(false),
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
