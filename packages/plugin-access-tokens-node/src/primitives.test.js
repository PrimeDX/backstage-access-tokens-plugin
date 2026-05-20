import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSubject, sha256hex } from './primitives.js';

test('sha256hex produces stable output', () => {
  assert.equal(
    sha256hex('hello'),
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  );
});

test('buildSubject produces the stable service-token subject format', () => {
  assert.equal(
    buildSubject('group:default/platform-team', 'cicd-pipeline'),
    'service-token:group:default/platform-team:cicd-pipeline',
  );
});

test('buildSubject preserves arbitrary group refs and token names', () => {
  assert.equal(
    buildSubject('group:payments/core-services', 'deploy-bot-01'),
    'service-token:group:payments/core-services:deploy-bot-01',
  );
});
