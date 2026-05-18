import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultUserTokenExpiry,
  formatUserTokenDate,
  isValidMintResultMessage,
  validateUserTokenExpiry,
  validateUserTokenName,
} from './userTokensHelpers.js';

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

test('isValidMintResultMessage rejects mismatched origin', () => {
  assert.equal(
    isValidMintResultMessage(
      {
        origin: 'https://attacker.example.com',
        data: { type: 'user-tokens-mint-result', flowId: 'F', token: 't', metadata: {} },
      },
      { expectedOrigin: 'https://backstage.example.com', expectedFlowId: 'F' },
    ),
    false,
  );
});

test('isValidMintResultMessage rejects unexpected message type', () => {
  assert.equal(
    isValidMintResultMessage(
      {
        origin: 'https://x',
        data: { type: 'something-else', flowId: 'F', token: 't', metadata: {} },
      },
      { expectedOrigin: 'https://x', expectedFlowId: 'F' },
    ),
    false,
  );
});

test('isValidMintResultMessage rejects mismatched flowId', () => {
  assert.equal(
    isValidMintResultMessage(
      {
        origin: 'https://x',
        data: { type: 'user-tokens-mint-result', flowId: 'wrong', token: 't', metadata: {} },
      },
      { expectedOrigin: 'https://x', expectedFlowId: 'F' },
    ),
    false,
  );
});

test('isValidMintResultMessage rejects missing token or metadata', () => {
  for (const data of [
    { type: 'user-tokens-mint-result', flowId: 'F', token: '', metadata: {} },
    { type: 'user-tokens-mint-result', flowId: 'F', token: 't', metadata: null },
    { type: 'user-tokens-mint-result', flowId: 'F', metadata: {} },
  ]) {
    assert.equal(
      isValidMintResultMessage(
        { origin: 'https://x', data },
        { expectedOrigin: 'https://x', expectedFlowId: 'F' },
      ),
      false,
    );
  }
});

test('isValidMintResultMessage accepts the happy path', () => {
  assert.equal(
    isValidMintResultMessage(
      {
        origin: 'https://x',
        data: {
          type: 'user-tokens-mint-result',
          flowId: 'F',
          token: 'sess.tail',
          metadata: { id: 'tok-1' },
        },
      },
      { expectedOrigin: 'https://x', expectedFlowId: 'F' },
    ),
    true,
  );
});
