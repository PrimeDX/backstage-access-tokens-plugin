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
