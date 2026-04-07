import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGroupEntityRef } from './entityRefs.js';

test('normalizeGroupEntityRef preserves full group refs', () => {
  assert.equal(
    normalizeGroupEntityRef('group:default/platform-team'),
    'group:default/platform-team',
  );
});

test('normalizeGroupEntityRef defaults namespace for short group refs', () => {
  assert.equal(normalizeGroupEntityRef('platform-team'), 'group:default/platform-team');
});

test('normalizeGroupEntityRef normalizes kind casing', () => {
  assert.equal(
    normalizeGroupEntityRef('Group:development/platform-team'),
    'group:development/platform-team',
  );
});

test('normalizeGroupEntityRef rejects non-group refs', () => {
  assert.equal(normalizeGroupEntityRef('user:default/alice'), undefined);
});

test('normalizeGroupEntityRef rejects malformed refs', () => {
  assert.equal(normalizeGroupEntityRef('group:default/platform/team'), undefined);
  assert.equal(normalizeGroupEntityRef('group:/platform-team'), undefined);
  assert.equal(normalizeGroupEntityRef(''), undefined);
});
