import { createPermission } from '@backstage/plugin-permission-common';

/**
 * Resource type identifier for service tokens.
 * Used by Backstage RBAC plugins to group permissions and by the
 * conditional permission framework for resource-level decisions.
 */
export const SERVICE_TOKEN_RESOURCE_TYPE = 'service-token';

/**
 * Permission to read service tokens — list, get, view audit logs, list scopes.
 */
export const serviceTokensReadPermission = createPermission({
  name: 'service-tokens:read',
  attributes: { action: 'read' },
  resourceType: SERVICE_TOKEN_RESOURCE_TYPE,
});

/**
 * Permission to create service tokens.
 */
export const serviceTokensWritePermission = createPermission({
  name: 'service-tokens:write',
  attributes: { action: 'create' },
  resourceType: SERVICE_TOKEN_RESOURCE_TYPE,
});

/**
 * Permission to revoke service tokens.
 */
export const serviceTokensRevokePermission = createPermission({
  name: 'service-tokens:revoke',
  attributes: { action: 'delete' },
  resourceType: SERVICE_TOKEN_RESOURCE_TYPE,
});

/**
 * All service token permissions — convenience array for registration.
 */
export const serviceTokensPermissions = [
  serviceTokensReadPermission,
  serviceTokensWritePermission,
  serviceTokensRevokePermission,
];

/**
 * @deprecated Use serviceTokensReadPermission, serviceTokensWritePermission,
 * or serviceTokensRevokePermission instead. Will be removed in the next major version.
 */
export const serviceTokensAdminPermission = serviceTokensReadPermission;

/**
 * Resource type identifier for user-minted personal access tokens.
 *
 * User tokens are a separate, user-self-service capability that lives
 * alongside the admin-managed service tokens. See
 * `docs/spec/user-tokens-overview.md` for the design rationale.
 */
export const USER_TOKEN_RESOURCE_TYPE = 'user-token';

/**
 * Permission to read the calling user's own personal access tokens
 * (list, get, audit). Scoping to the caller is enforced in the handler;
 * this permission gates the action category.
 */
export const userTokensReadPermission = createPermission({
  name: 'user-tokens:read',
  attributes: { action: 'read' },
  resourceType: USER_TOKEN_RESOURCE_TYPE,
});

/**
 * Permission to mint a new personal access token for the calling user.
 */
export const userTokensWritePermission = createPermission({
  name: 'user-tokens:write',
  attributes: { action: 'create' },
  resourceType: USER_TOKEN_RESOURCE_TYPE,
});

/**
 * Permission to revoke one of the calling user's personal access tokens.
 */
export const userTokensRevokePermission = createPermission({
  name: 'user-tokens:revoke',
  attributes: { action: 'delete' },
  resourceType: USER_TOKEN_RESOURCE_TYPE,
});

/**
 * All user token permissions — convenience array for registration.
 */
export const userTokensPermissions = [
  userTokensReadPermission,
  userTokensWritePermission,
  userTokensRevokePermission,
];
