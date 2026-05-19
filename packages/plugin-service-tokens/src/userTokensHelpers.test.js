import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultUserTokenExpiry,
  formatUserTokenDate,
  parseMintResultFragment,
  validateUserTokenExpiry,
  validateUserTokenName,
} from './userTokensHelpers.js';

function encodeFragmentPayload(payload) {
  const json = JSON.stringify(payload);
  // Replicate the backend's encoding (base64url, no padding).
  return Buffer.from(json, 'utf8').toString('base64url');
}

test('formatUserTokenDate returns Never for null / undefined', () => {
  assert.equal(formatUserTokenDate(null), 'Never');
  assert.equal(formatUserTokenDate(undefined), 'Never');
});

test('formatUserTokenDate accepts ISO strings', () => {
  const out = formatUserTokenDate('2026-05-19T12:00:00.000Z');
  assert.notEqual(out, 'Never');
  assert.equal(typeof out, 'string');
});

test('validateUserTokenName rejects empty / whitespace-only / too-long input', () => {
  assert.match(validateUserTokenName(''), /required/);
  assert.match(validateUserTokenName('   '), /required/);
  assert.match(validateUserTokenName('a'.repeat(101)), /100/);
});

test('validateUserTokenName rejects disallowed characters', () => {
  assert.match(validateUserTokenName('with<bracket>'), /disallowed/);
  assert.match(validateUserTokenName('semi;colon'), /disallowed/);
});

test('validateUserTokenName accepts common identifier characters', () => {
  assert.equal(validateUserTokenName('ci-deploy'), null);
  assert.equal(validateUserTokenName('My Token 01'), null);
  assert.equal(validateUserTokenName('group/subteam:tool'), null);
});

test('validateUserTokenExpiry treats empty/null/undefined as no override', () => {
  assert.equal(validateUserTokenExpiry(''), null);
  assert.equal(validateUserTokenExpiry(null), null);
  assert.equal(validateUserTokenExpiry(undefined), null);
});

test('validateUserTokenExpiry rejects invalid and past dates', () => {
  assert.match(validateUserTokenExpiry('not-a-date'), /valid date/);
  assert.match(validateUserTokenExpiry('1999-01-01'), /future/);
});

test('validateUserTokenExpiry accepts future dates', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(validateUserTokenExpiry(future), null);
});

test('defaultUserTokenExpiry returns 30 days ahead in datetime-local format', () => {
  const fixed = new Date('2026-05-19T12:00:00.000Z').getTime();
  const out = defaultUserTokenExpiry(fixed);
  assert.equal(out, '2026-06-18T12:00');
});

test('parseMintResultFragment returns null for non-matching hashes', () => {
  assert.equal(parseMintResultFragment(null), null);
  assert.equal(parseMintResultFragment(''), null);
  assert.equal(parseMintResultFragment('#other-thing=foo'), null);
  assert.equal(parseMintResultFragment('user-tokens-mint=xxx'), null);
});

test('parseMintResultFragment returns null for malformed base64', () => {
  assert.equal(parseMintResultFragment('#user-tokens-mint=!!!'), null);
});

test('parseMintResultFragment returns null for JSON without required shape', () => {
  const badShape = encodeFragmentPayload({ type: 'something-else', flowId: 'F' });
  assert.equal(parseMintResultFragment(`#user-tokens-mint=${badShape}`), null);

  const missingToken = encodeFragmentPayload({
    type: 'user-tokens-mint-result',
    flowId: 'F',
    metadata: { id: 'x' },
  });
  assert.equal(parseMintResultFragment(`#user-tokens-mint=${missingToken}`), null);

  const missingMetadata = encodeFragmentPayload({
    type: 'user-tokens-mint-result',
    flowId: 'F',
    token: 't',
  });
  assert.equal(parseMintResultFragment(`#user-tokens-mint=${missingMetadata}`), null);
});

test('parseMintResultFragment accepts a well-formed payload', () => {
  const payload = {
    type: 'user-tokens-mint-result',
    flowId: 'F1',
    token: 'sess-id.long-random',
    metadata: {
      id: 'tok-1',
      name: 'my-ci',
      createdAt: '2026-05-19T12:00:00.000Z',
      expiresAt: '2026-06-18T12:00:00.000Z',
      prefix: 'sess-id.',
    },
  };
  const out = parseMintResultFragment(
    `#user-tokens-mint=${encodeFragmentPayload(payload)}`,
  );
  assert.deepEqual(out, payload);
});
