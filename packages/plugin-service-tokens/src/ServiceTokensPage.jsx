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
const GROUP_FETCH_RETRY_INTERVAL_MS = 2000;
const GROUP_FETCH_MAX_ATTEMPTS = 30;
const GROUP_KIND_FILTERS = ['group', 'Group'];
const GROUP_ENDPOINT_BUILDERS = [
  (catalogBase, kindFilter) => `${catalogBase}/entities/by-query?filter=kind=${kindFilter}&limit=200`,
  (catalogBase, kindFilter) => `${catalogBase}/entities?filter=kind=${kindFilter}&limit=200`,
];

const EMPTY_FORM = () => ({
  name: '',
  description: '',
  groupEntityRef: '',
  scopes: [],
  expiresAt: defaultExpiryValue(),
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCatalogEntities(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items
      .map(item => item?.entity ?? item)
      .filter(Boolean);
  }

  if (Array.isArray(payload?.results)) {
    return payload.results
      .map(item => item?.entity ?? item)
      .filter(Boolean);
  }

  return [];
}

function toEntityRefParts(entityRef) {
  const [kindPart = '', targetPart = ''] = String(entityRef).split(':', 2);
  const [namespacePart = 'default', namePart = ''] = targetPart.split('/', 2);
  const kind = kindPart.toLocaleLowerCase('en-US');
  if (!kind || !namePart) {
    return null;
  }
  return { kind, namespace: namespacePart || 'default', name: namePart };
}

function extractOwnershipEntityRefs(payload) {
  if (Array.isArray(payload?.ownershipEntityRefs)) return payload.ownershipEntityRefs;
  if (Array.isArray(payload?.identity?.ownershipEntityRefs)) {
    return payload.identity.ownershipEntityRefs;
  }
  if (Array.isArray(payload?.ent)) return payload.ent;
  if (Array.isArray(payload?.claims?.ent)) return payload.claims.ent;
  return [];
}

async function fetchEntityByName(fetchApi, catalogBase, entityRefParts) {
  const kind = encodeURIComponent(entityRefParts.kind);
  const namespace = encodeURIComponent(entityRefParts.namespace);
  const name = encodeURIComponent(entityRefParts.name);
  const response = await fetchApi.fetch(
    `${catalogBase}/entities/by-name/${kind}/${namespace}/${name}`,
  );
  if (!response.ok) {
    return null;
  }
  return response.json();
}

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
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState(null);
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

  const loadGroupOptions = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const catalogBase = await discoveryApi.getBaseUrl('catalog');
      const authBase = await discoveryApi.getBaseUrl('auth');
      await fetchApi.fetch(`${authBase}/guest/refresh`).catch(() => {});

      for (let attempt = 0; attempt < GROUP_FETCH_MAX_ATTEMPTS; attempt += 1) {
        for (const endpointBuilder of GROUP_ENDPOINT_BUILDERS) {
          for (const kindFilter of GROUP_KIND_FILTERS) {
            const groupsRes = await fetchApi.fetch(
              endpointBuilder(catalogBase, kindFilter),
            );

            if (groupsRes.ok) {
              const payload = await groupsRes.json();
              const entities = extractCatalogEntities(payload).filter(
                entity =>
                  String(entity?.kind ?? '').toLocaleLowerCase('en-US') === 'group' &&
                  Boolean(entity?.metadata?.name),
              );
              const nextOptions = mapGroupEntityOptions(entities);

              if (nextOptions.length > 0) {
                setGroupOptions(nextOptions);
                return nextOptions;
              }
            }
          }
        }

        const userInfoRes = await fetchApi.fetch(`${authBase}/v1/userinfo`);
        if (userInfoRes.ok) {
          const userInfoPayload = await userInfoRes.json();
          const ownershipGroupRefs = extractOwnershipEntityRefs(userInfoPayload)
            .map(toEntityRefParts)
            .filter(Boolean)
            .filter(parts => parts.kind === 'group');

          const ownershipEntities = [];
          for (const groupRef of ownershipGroupRefs) {
            const entity = await fetchEntityByName(fetchApi, catalogBase, groupRef).catch(
              () => null,
            );
            if (
              entity &&
              String(entity?.kind ?? '').toLocaleLowerCase('en-US') === 'group' &&
              entity?.metadata?.name
            ) {
              ownershipEntities.push(entity);
            }
          }

          const fallbackOptions = mapGroupEntityOptions(ownershipEntities);
          if (fallbackOptions.length > 0) {
            setGroupOptions(fallbackOptions);
            return fallbackOptions;
          }
        }

        if (attempt < GROUP_FETCH_MAX_ATTEMPTS - 1) {
          await sleep(GROUP_FETCH_RETRY_INTERVAL_MS);
        }
      }
      setGroupsError(
        'Groups are still loading from the catalog. Please wait a moment and try again.',
      );
      return [];
    } catch {
      setGroupsError(
        'Unable to load groups from the catalog right now. Please retry in a few seconds.',
      );
      return [];
    } finally {
      setGroupsLoading(false);
    }
  }, [discoveryApi, fetchApi]);

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

      await loadGroupOptions();
    }

    loadMeta();
  }, [loadTokens, loadGroupOptions, discoveryApi, fetchApi]);

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
  async function handleOpenCreate() {
    const nextOptions = await loadGroupOptions();
    if (!nextOptions.length) {
      return;
    }
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
                'div',
                { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } },
                h(
                  Button,
                  {
                    variant: 'contained',
                    color: 'primary',
                    onClick: handleOpenCreate,
                    disabled: groupsLoading,
                  },
                  groupsLoading ? 'Loading groups...' : 'Create token',
                ),
                groupsError ? h('small', { style: { marginTop: 6 } }, groupsError) : null,
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
