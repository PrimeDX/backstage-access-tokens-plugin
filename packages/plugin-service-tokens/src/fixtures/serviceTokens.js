export const storyNow = Date.parse('2026-04-04T12:00:00.000Z');

export const serviceTokenFixtures = {
  active: {
    id: 'token-1',
    name: 'deploy-bot',
    description: 'Used by deployment automation',
    tokenPrefix: 'stk_live_abc123',
    groupEntityRef: 'group:default/platform-team',
    scopes: ['catalog:read', 'permission:read'],
    status: 'active',
    expiresAt: '2026-04-10T12:00:00.000Z',
    lastUsedAt: '2026-04-03T08:00:00.000Z',
    createdBy: 'user:default/alice',
  },
  expiring: {
    id: 'token-2',
    name: 'support-bot',
    description: 'Used by support automations',
    tokenPrefix: 'stk_live_def456',
    groupEntityRef: 'group:default/support',
    scopes: ['catalog:read'],
    status: 'expiring',
    expiresAt: '2026-04-05T12:00:00.000Z',
    lastUsedAt: '2026-04-04T07:00:00.000Z',
    createdBy: 'user:default/bob',
  },
  revoked: {
    id: 'token-3',
    name: 'legacy-sync',
    description: 'Retired synchronization token',
    tokenPrefix: 'stk_live_xyz789',
    groupEntityRef: 'group:default/integrations',
    scopes: ['catalog:read'],
    status: 'revoked',
    expiresAt: '2026-03-20T12:00:00.000Z',
    lastUsedAt: null,
    createdBy: 'user:default/carol',
  },
};

export const scopeFixtures = [
  {
    id: 'catalog:read',
    label: 'Catalog — Read',
    description: 'Read access to the Software Catalog API',
  },
  {
    id: 'catalog:write',
    label: 'Catalog — Write',
    description: 'Write access to the Software Catalog API',
  },
  {
    id: 'permission:read',
    label: 'Permission — Read',
    description: 'Read access to the Permission framework',
  },
  {
    id: 'scaffolder:read',
    label: 'Scaffolder — Read',
    description: 'Read access to Scaffolder templates and tasks',
  },
  {
    id: 'scaffolder:execute',
    label: 'Scaffolder — Execute',
    description: 'Execute Scaffolder templates',
  },
];

export const groupOptionFixtures = [
  {
    value: 'group:default/platform-team',
    label: 'Platform Team',
    description: 'type: team',
  },
  {
    value: 'group:default/support',
    label: 'Support',
    description: 'type: team',
  },
  {
    value: 'group:default/integrations',
    label: 'Integrations',
    description: 'type: team',
  },
  {
    value: 'group:default/security',
    label: 'Security',
    description: 'type: team',
  },
];

export const auditLogFixtures = [
  {
    id: 'audit-1',
    event: 'created',
    actorEntityRef: 'user:default/alice',
    reason: null,
    createdAt: '2026-03-25T09:00:00.000Z',
  },
  {
    id: 'audit-2',
    event: 'used',
    actorEntityRef: 'group:default/platform-team',
    reason: null,
    createdAt: '2026-03-26T14:32:00.000Z',
  },
  {
    id: 'audit-3',
    event: 'used',
    actorEntityRef: 'group:default/platform-team',
    reason: null,
    createdAt: '2026-04-01T08:15:00.000Z',
  },
  {
    id: 'audit-4',
    event: 'revoked',
    actorEntityRef: 'user:default/alice',
    reason: 'Credential rotation — quarterly policy',
    createdAt: '2026-04-04T11:00:00.000Z',
  },
];
