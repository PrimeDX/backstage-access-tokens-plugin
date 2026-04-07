import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveStoredTokenFields,
  generateRawToken,
} from './tokens.js';

test('generateRawToken creates a bsst_ prefixed token', () => {
  const token = generateRawToken();

  assert.match(token, /^bsst_[A-Za-z0-9_-]+$/);
  assert.ok(token.length > 'bsst_'.length);
});

test('generateRawToken uses 32 random bytes encoded as base64url', () => {
  const token = generateRawToken();
  const encoded = token.slice('bsst_'.length);
  const decoded = Buffer.from(encoded, 'base64url');

  assert.equal(decoded.length, 32);
});

test('deriveStoredTokenFields returns the expected hash and prefix', () => {
  const rawToken = 'bsst_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu';

  const result = deriveStoredTokenFields(rawToken);

  assert.deepEqual(result, {
    tokenHash:
      'c60a3ee88331204cf2abd45875be0240fd245b7255a57d42ffd45af4655cf56a',
    tokenPrefix: 'bsst_dGhpcyB',
  });
});

test('deriveStoredTokenFields stores the first 12 characters as tokenPrefix', () => {
  const rawToken = 'bsst_abcdefghijklmnopqrstuvwxyz0123456789';

  const result = deriveStoredTokenFields(rawToken);

  assert.equal(result.tokenPrefix, rawToken.slice(0, 12));
});
