import { createPermission } from '@backstage/plugin-permission-common';

/**
 * Resource type identifier for service tokens.
 * Used by Backstage RBAC plugins to group permissions and by the
 * conditional permission framework for resource-level decisions.
 */
export const SERVICE_ACCESS_TOKEN_RESOURCE_TYPE = 'access-token-service';

/**
 * Permission to read service tokens — list, get, view audit logs, list scopes.
 */
export const serviceAccessTokensReadPermission = createPermission({
  name: 'access-tokens:service:read',
  attributes: { action: 'read' },
  resourceType: SERVICE_ACCESS_TOKEN_RESOURCE_TYPE,
});

/**
 * Permission to create service tokens.
 */
export const serviceAccessTokensWritePermission = createPermission({
  name: 'access-tokens:service:write',
  attributes: { action: 'create' },
  resourceType: SERVICE_ACCESS_TOKEN_RESOURCE_TYPE,
});

/**
 * Permission to revoke service tokens.
 */
export const serviceAccessTokensRevokePermission = createPermission({
  name: 'access-tokens:service:revoke',
  attributes: { action: 'delete' },
  resourceType: SERVICE_ACCESS_TOKEN_RESOURCE_TYPE,
});

/**
 * All service token permissions — convenience array for registration.
 */
export const serviceAccessTokensPermissions = [
  serviceAccessTokensReadPermission,
  serviceAccessTokensWritePermission,
  serviceAccessTokensRevokePermission,
];

/**
 * Resource type identifier for user-minted personal access tokens.
 *
 * User tokens are a separate, user-self-service capability that lives
 * alongside the admin-managed service tokens. See
 * `docs/spec/user-tokens-overview.md` for the design rationale.
 */
export const PERSONAL_ACCESS_TOKEN_RESOURCE_TYPE = 'access-token-user';

/**
 * Permission to read the calling user's own personal access tokens
 * (list, get, audit). Scoping to the caller is enforced in the handler;
 * this permission gates the action category.
 */
export const personalAccessTokensReadPermission = createPermission({
  name: 'access-tokens:user:read',
  attributes: { action: 'read' },
  resourceType: PERSONAL_ACCESS_TOKEN_RESOURCE_TYPE,
});

/**
 * Permission to mint a new personal access token for the calling user.
 */
export const personalAccessTokensWritePermission = createPermission({
  name: 'access-tokens:user:write',
  attributes: { action: 'create' },
  resourceType: PERSONAL_ACCESS_TOKEN_RESOURCE_TYPE,
});

/**
 * Permission to revoke one of the calling user's personal access tokens.
 */
export const personalAccessTokensRevokePermission = createPermission({
  name: 'access-tokens:user:revoke',
  attributes: { action: 'delete' },
  resourceType: PERSONAL_ACCESS_TOKEN_RESOURCE_TYPE,
});

/**
 * All user token permissions — convenience array for registration.
 */
export const personalAccessTokensPermissions = [
  personalAccessTokensReadPermission,
  personalAccessTokensWritePermission,
  personalAccessTokensRevokePermission,
];
