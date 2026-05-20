import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveStoredTokenFields,
  generateRawToken,
} from './tokens.js';

test('generateRawToken creates a bsat_ prefixed token', () => {
  const token = generateRawToken();

  assert.match(token, /^bsat_[A-Za-z0-9_-]+$/);
  assert.ok(token.length > 'bsat_'.length);
});

test('generateRawToken uses 32 random bytes encoded as base64url', () => {
  const token = generateRawToken();
  const encoded = token.slice('bsat_'.length);
  const decoded = Buffer.from(encoded, 'base64url');

  assert.equal(decoded.length, 32);
});

test('deriveStoredTokenFields returns the expected hash and prefix', () => {
  const rawToken = 'bsat_dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu';

  const result = deriveStoredTokenFields(rawToken);

  assert.deepEqual(result, {
    tokenHash:
      'addfe4e8dacfac0c9a1b3212c5a11263a22e2a86df288b73c40ae858d703acef',
    tokenPrefix: 'bsat_dGhpcyB',
  });
});

test('deriveStoredTokenFields stores the first 12 characters as tokenPrefix', () => {
  const rawToken = 'bsat_abcdefghijklmnopqrstuvwxyz0123456789';

  const result = deriveStoredTokenFields(rawToken);

  assert.equal(result.tokenPrefix, rawToken.slice(0, 12));
});
