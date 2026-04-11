import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button } from '@material-ui/core';
import { Content, Header, Page } from '@backstage/core-components';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { ServiceTokensTableView } from './components/ServiceTokensTableView.jsx';
import { ServiceTokensFilters } from './components/ServiceTokensFilters.jsx';
import { CreateTokenDialog } from './components/CreateTokenDialog.jsx';
import { RevokeDialog } from './components/RevokeDialog.jsx';
import { AuditLogDialog } from './components/AuditLogDialog.jsx';
import {
  buildListQuery,
  defaultExpiryValue,
  mapGroupEntityOptions,
} from './helpers.js';

const h = React.createElement;

const EMPTY_FORM = () => ({
  name: '',
  description: '',
  groupEntityRef: '',
  scopes: [],
  expiresAt: defaultExpiryValue(),
});

export function ServiceTokensPage() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  // ── token list ──────────────────────────────────────────────────────────────
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // ── filters ─────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({ status: '', groupEntityRef: '' });

  // ── create dialog ────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [scopes, setScopes] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createdToken, setCreatedToken] = useState(null);
  const [createError, setCreateError] = useState(null);

  // ── revoke dialog ────────────────────────────────────────────────────────────
  const [revokeToken, setRevokeToken] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState(null);

  // ── audit log dialog ─────────────────────────────────────────────────────────
  const [auditToken, setAuditToken] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ── load token list ──────────────────────────────────────────────────────────
  const loadTokens = useCallback(
    async (activeFilters = {}) => {
      setLoading(true);
      setError(null);
      try {
        const baseUrl = await discoveryApi.getBaseUrl('service-tokens');
        const query = buildListQuery(activeFilters);
        const response = await fetchApi.fetch(`${baseUrl}${query}`);
        if (!response.ok) {
          throw new Error(`Failed to load tokens: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        setTokens(data.tokens ?? []);
        setNow(Date.now());
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [discoveryApi, fetchApi],
  );

  // ── load scopes + group options on mount ─────────────────────────────────────
  useEffect(() => {
    loadTokens();

    async function loadMeta() {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('service-tokens');
        const scopesRes = await fetchApi.fetch(`${baseUrl}/scopes`);
        if (scopesRes.ok) {
          const data = await scopesRes.json();
          setScopes(
            (data.scopes ?? []).map(s => ({
              id: s.id,
              label: s.id,
              description: s.description ?? '',
            })),
          );
        }
      } catch {
        // non-fatal — scopes list will be empty
      }

      try {
        const catalogBase = await discoveryApi.getBaseUrl('catalog');
        const groupsRes = await fetchApi.fetch(
          `${catalogBase}/entities?filter=kind=Group&limit=200`,
        );
        if (groupsRes.ok) {
          const entities = await groupsRes.json();
          setGroupOptions(mapGroupEntityOptions(entities));
        }
      } catch {
        // non-fatal — group dropdown will be empty
      }
    }

    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── filter change ────────────────────────────────────────────────────────────
  function handleStatusChange(status) {
    const next = { ...filters, status };
    setFilters(next);
    loadTokens(next);
  }

  function handleGroupChange(groupEntityRef) {
    const next = { ...filters, groupEntityRef };
    setFilters(next);
    loadTokens(next);
  }

  // ── create token ─────────────────────────────────────────────────────────────
  function handleOpenCreate() {
    setCreateForm(EMPTY_FORM());
    setCreatedToken(null);
    setCreateError(null);
    setCreateOpen(true);
  }

  function handleCreateFormChange(field, value) {
    setCreateForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleCreateSubmit() {
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const baseUrl = await discoveryApi.getBaseUrl('service-tokens');
      const expiresAt = new Date(createForm.expiresAt).toISOString();
      const response = await fetchApi.fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          description: createForm.description.trim(),
          groupEntityRef: createForm.groupEntityRef,
          scopes: createForm.scopes,
          expiresAt,
        }),
      });
      if (!response.ok) {
        let message = `Failed to create token (${response.status})`;
        try {
          const errBody = await response.json();
          if (errBody?.error) message = errBody.error;
        } catch {
          // ignore parse error
        }
        setCreateError(message);
        return;
      }
      const data = await response.json();
      setCreatedToken(data);
      loadTokens(filters);
    } catch (err) {
      setCreateError(err.message ?? 'Unexpected error');
    } finally {
      setCreateSubmitting(false);
    }
  }

  function handleCreateClose() {
    setCreateOpen(false);
    setCreatedToken(null);
    setCreateError(null);
    setCreateForm(EMPTY_FORM());
  }

  // ── revoke token ─────────────────────────────────────────────────────────────
  function handleOpenRevoke(token) {
    setRevokeToken(token);
    setRevokeReason('');
    setRevokeError(null);
  }

  async function handleRevokeConfirm() {
    if (!revokeToken) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const baseUrl = await discoveryApi.getBaseUrl('service-tokens');
      const response = await fetchApi.fetch(`${baseUrl}/${revokeToken.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revokeReason }),
      });
      if (!response.ok) {
        let message = `Failed to revoke token (${response.status})`;
        try {
          const errBody = await response.json();
          if (errBody?.error) message = errBody.error;
        } catch {
          // ignore parse error
        }
        setRevokeError(message);
        return;
      }
      setRevokeToken(null);
      setRevokeReason('');
      loadTokens(filters);
    } catch (err) {
      setRevokeError(err.message ?? 'Unexpected error');
    } finally {
      setRevoking(false);
    }
  }

  function handleRevokeClose() {
    if (revoking) return;
    setRevokeToken(null);
    setRevokeReason('');
    setRevokeError(null);
  }

  // ── audit log ────────────────────────────────────────────────────────────────
  async function handleOpenAudit(token) {
    setAuditToken(token);
    setAuditEntries([]);
    setAuditLoading(true);
    try {
      const baseUrl = await discoveryApi.getBaseUrl('service-tokens');
      const response = await fetchApi.fetch(`${baseUrl}/${token.id}/audit`);
      if (!response.ok) {
        throw new Error(`Failed to load audit log: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      setAuditEntries(
        (data.events ?? []).map(e => ({
          id: e.id,
          event: e.event,
          actorEntityRef: e.actor ?? null,
          reason: e.metadata?.reason ?? null,
          createdAt: e.occurredAt,
        })),
      );
    } catch {
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }

  function handleAuditClose() {
    setAuditToken(null);
    setAuditEntries([]);
  }

  // ── render ───────────────────────────────────────────────────────────────────
  return h(
    Page,
    { themeId: 'tool' },
    h(Header, {
      title: 'Service Tokens',
      subtitle: 'Create, inspect, and revoke service credentials for Backstage integrations.',
    }),
    h(
      Content,
      null,
      error
        ? h('div', null, `Error: ${error.message}`)
        : h(
            React.Fragment,
            null,
            h(
              Box,
              { display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 },
              h(ServiceTokensFilters, {
                status: filters.status,
                groupEntityRef: filters.groupEntityRef,
                onStatusChange: handleStatusChange,
                onGroupChange: handleGroupChange,
              }),
              h(
                Button,
                {
                  variant: 'contained',
                  color: 'primary',
                  onClick: handleOpenCreate,
                },
                'Create token',
              ),
            ),
            h(ServiceTokensTableView, {
              loading,
              tokens,
              now,
              onAudit: handleOpenAudit,
              onRevoke: handleOpenRevoke,
            }),
          ),
      h(CreateTokenDialog, {
        open: createOpen,
        scopes,
        groupOptions,
        form: createForm,
        onFormChange: handleCreateFormChange,
        onSubmit: handleCreateSubmit,
        onClose: handleCreateClose,
        submitting: createSubmitting,
        createdToken,
        submitError: createError,
      }),
      h(RevokeDialog, {
        open: Boolean(revokeToken),
        token: revokeToken,
        reason: revokeReason,
        onReasonChange: setRevokeReason,
        onConfirm: handleRevokeConfirm,
        onClose: handleRevokeClose,
        revoking,
        submitError: revokeError,
      }),
      h(AuditLogDialog, {
        open: Boolean(auditToken),
        token: auditToken,
        entries: auditEntries,
        loading: auditLoading,
        onClose: handleAuditClose,
      }),
    ),
  );
}
