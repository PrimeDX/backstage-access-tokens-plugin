import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SERVICE_ACCESS_TOKEN_RESOURCE_TYPE,
  PERSONAL_ACCESS_TOKEN_RESOURCE_TYPE,
  serviceAccessTokensPermissions,
  serviceAccessTokensReadPermission,
  serviceAccessTokensRevokePermission,
  serviceAccessTokensWritePermission,
  personalAccessTokensPermissions,
  personalAccessTokensReadPermission,
  personalAccessTokensRevokePermission,
  personalAccessTokensWritePermission,
} from './permission.js';

test('service-token resource type and permission names are stable', () => {
  assert.equal(SERVICE_ACCESS_TOKEN_RESOURCE_TYPE, 'access-token-service');
  assert.equal(serviceAccessTokensReadPermission.name, 'access-tokens:service:read');
  assert.equal(serviceAccessTokensWritePermission.name, 'access-tokens:service:write');
  assert.equal(serviceAccessTokensRevokePermission.name, 'access-tokens:service:revoke');
});

test('service-token permissions array covers read/write/revoke', () => {
  assert.equal(serviceAccessTokensPermissions.length, 3);
  assert.deepEqual(
    serviceAccessTokensPermissions.map(p => p.name).sort(),
    ['access-tokens:service:read', 'access-tokens:service:revoke', 'access-tokens:service:write'],
  );
});

test('user-token resource type and permission names are stable', () => {
  assert.equal(PERSONAL_ACCESS_TOKEN_RESOURCE_TYPE, 'access-token-user');
  assert.equal(personalAccessTokensReadPermission.name, 'access-tokens:user:read');
  assert.equal(personalAccessTokensWritePermission.name, 'access-tokens:user:write');
  assert.equal(personalAccessTokensRevokePermission.name, 'access-tokens:user:revoke');
});

test('user-token permissions array covers read/write/revoke', () => {
  assert.equal(personalAccessTokensPermissions.length, 3);
  assert.deepEqual(
    personalAccessTokensPermissions.map(p => p.name).sort(),
    ['access-tokens:user:read', 'access-tokens:user:revoke', 'access-tokens:user:write'],
  );
});

test('user-token and service-token permissions are distinct resource types', () => {
  assert.notEqual(personalAccessTokensReadPermission.resourceType, serviceAccessTokensReadPermission.resourceType);
  assert.equal(personalAccessTokensReadPermission.resourceType, PERSONAL_ACCESS_TOKEN_RESOURCE_TYPE);
  assert.equal(serviceAccessTokensReadPermission.resourceType, SERVICE_ACCESS_TOKEN_RESOURCE_TYPE);
});

test('user-token permissions declare the right action attributes', () => {
  assert.equal(personalAccessTokensReadPermission.attributes.action, 'read');
  assert.equal(personalAccessTokensWritePermission.attributes.action, 'create');
  assert.equal(personalAccessTokensRevokePermission.attributes.action, 'delete');
});
