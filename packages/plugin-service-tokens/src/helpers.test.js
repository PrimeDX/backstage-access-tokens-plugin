import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildListQuery,
  defaultExpiryValue,
  formatRelativeTime,
  groupEntityOptionToRef,
  isCreateFormValid,
  mapGroupEntityOptions,
  toDateTimeLocalValue,
  toIsoDateTime,
} from './helpers.js';

test('buildListQuery returns an empty string when no filters are set', () => {
  assert.equal(buildListQuery({}), '');
});

test('buildListQuery includes status and group filters', () => {
  assert.equal(
    buildListQuery({
      status: 'revoked',
      groupEntityRef: 'group:default/platform-team',
    }),
    '?status=revoked&groupEntityRef=group%3Adefault%2Fplatform-team',
  );
});

test('defaultExpiryValue returns a datetime-local string 30 days in the future', () => {
  assert.equal(
    defaultExpiryValue(Date.parse('2026-04-04T12:00:00.000Z')),
    '2026-05-04T12:00',
  );
});

test('toIsoDateTime converts datetime-local values to ISO strings', () => {
  assert.equal(
    toIsoDateTime('2026-05-04T12:00'),
    new Date('2026-05-04T12:00').toISOString(),
  );
});

test('formatRelativeTime renders future and past day values', () => {
  const now = Date.parse('2026-04-04T12:00:00.000Z');

  assert.equal(formatRelativeTime('2026-04-06T12:00:00.000Z', now), 'in 2 days');
  assert.equal(formatRelativeTime('2026-04-02T12:00:00.000Z', now), '2 days ago');
  assert.equal(formatRelativeTime(null, now), 'Never');
});

test('isCreateFormValid requires all fields and at least one scope', () => {
  assert.equal(
    isCreateFormValid({
      name: 'deploy-bot',
      description: 'Used by deployment automation',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      expiresAt: '2026-05-01T00:00',
    }),
    true,
  );

  assert.equal(
    isCreateFormValid({
      name: 'deploy-bot',
      description: '',
      groupEntityRef: 'group:default/platform-team',
      scopes: ['catalog:read'],
      expiresAt: '2026-05-01T00:00',
    }),
    false,
  );
});

test('mapGroupEntityOptions normalizes group entities for the picker', () => {
  assert.deepEqual(
    mapGroupEntityOptions([
      {
        kind: 'Group',
        metadata: {
          name: 'platform-team',
          namespace: 'default',
          title: 'Platform Team',
        },
        spec: {
          type: 'team',
        },
      },
    ]),
    [
      {
        kind: 'Group',
        namespace: 'default',
        name: 'platform-team',
        label: 'Platform Team',
        value: 'group:default/platform-team',
        description: 'type: team',
      },
    ],
  );
});

test('groupEntityOptionToRef returns an entity ref string', () => {
  assert.equal(
    groupEntityOptionToRef({
      kind: 'Group',
      namespace: 'default',
      name: 'platform-team',
    }),
    'group:default/platform-team',
  );
});
