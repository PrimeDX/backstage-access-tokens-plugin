import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SERVICE_TOKEN_RESOURCE_TYPE,
  USER_TOKEN_RESOURCE_TYPE,
  serviceTokensPermissions,
  serviceTokensReadPermission,
  serviceTokensRevokePermission,
  serviceTokensWritePermission,
  userTokensPermissions,
  userTokensReadPermission,
  userTokensRevokePermission,
  userTokensWritePermission,
} from './permission.js';

test('service-token resource type and permission names are stable', () => {
  assert.equal(SERVICE_TOKEN_RESOURCE_TYPE, 'service-token');
  assert.equal(serviceTokensReadPermission.name, 'service-tokens:read');
  assert.equal(serviceTokensWritePermission.name, 'service-tokens:write');
  assert.equal(serviceTokensRevokePermission.name, 'service-tokens:revoke');
});

test('service-token permissions array covers read/write/revoke', () => {
  assert.equal(serviceTokensPermissions.length, 3);
  assert.deepEqual(
    serviceTokensPermissions.map(p => p.name).sort(),
    ['service-tokens:read', 'service-tokens:revoke', 'service-tokens:write'],
  );
});

test('user-token resource type and permission names are stable', () => {
  assert.equal(USER_TOKEN_RESOURCE_TYPE, 'user-token');
  assert.equal(userTokensReadPermission.name, 'user-tokens:read');
  assert.equal(userTokensWritePermission.name, 'user-tokens:write');
  assert.equal(userTokensRevokePermission.name, 'user-tokens:revoke');
});

test('user-token permissions array covers read/write/revoke', () => {
  assert.equal(userTokensPermissions.length, 3);
  assert.deepEqual(
    userTokensPermissions.map(p => p.name).sort(),
    ['user-tokens:read', 'user-tokens:revoke', 'user-tokens:write'],
  );
});

test('user-token and service-token permissions are distinct resource types', () => {
  assert.notEqual(userTokensReadPermission.resourceType, serviceTokensReadPermission.resourceType);
  assert.equal(userTokensReadPermission.resourceType, USER_TOKEN_RESOURCE_TYPE);
  assert.equal(serviceTokensReadPermission.resourceType, SERVICE_TOKEN_RESOURCE_TYPE);
});

test('user-token permissions declare the right action attributes', () => {
  assert.equal(userTokensReadPermission.attributes.action, 'read');
  assert.equal(userTokensWritePermission.attributes.action, 'create');
  assert.equal(userTokensRevokePermission.attributes.action, 'delete');
});
