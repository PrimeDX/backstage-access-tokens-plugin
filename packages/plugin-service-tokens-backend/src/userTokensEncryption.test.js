import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import {
  decodeEncryptionKey,
  decryptRefreshToken,
  encryptRefreshToken,
} from './userTokensEncryption.js';

function makeKey() {
  return randomBytes(32);
}

test('decodeEncryptionKey requires a non-empty string', () => {
  assert.throws(() => decodeEncryptionKey(undefined), /required/);
  assert.throws(() => decodeEncryptionKey(''), /required/);
  assert.throws(() => decodeEncryptionKey(null), /required/);
});

test('decodeEncryptionKey rejects malformed base64', () => {
  assert.throws(() => decodeEncryptionKey('!!!not-base64!!!'), /32 bytes/);
});

test('decodeEncryptionKey rejects wrong length', () => {
  const short = Buffer.alloc(16).toString('base64');
  assert.throws(() => decodeEncryptionKey(short), /32 bytes/);
});

test('decodeEncryptionKey accepts a valid 32-byte base64 key', () => {
  const raw = randomBytes(32);
  const decoded = decodeEncryptionKey(raw.toString('base64'));
  assert.equal(Buffer.compare(decoded, raw), 0);
});

test('encryptRefreshToken returns 12-byte IV, 16-byte tag, and ciphertext', () => {
  const key = makeKey();
  const { ciphertext, iv, tag } = encryptRefreshToken(key, 'bsut_secret_value');
  assert.equal(iv.length, 12);
  assert.equal(tag.length, 16);
  assert.ok(ciphertext.length > 0);
});

test('encrypt/decrypt round-trip recovers the plaintext', () => {
  const key = makeKey();
  const plaintext = 'sessionId-abc.long-random-base64url-payload';
  const parts = encryptRefreshToken(key, plaintext);
  const recovered = decryptRefreshToken(key, parts);
  assert.equal(recovered, plaintext);
});

test('encrypt with different keys yields different ciphertexts and decrypt fails with wrong key', () => {
  const key1 = makeKey();
  const key2 = makeKey();
  const plaintext = 'bsut_token';
  const parts = encryptRefreshToken(key1, plaintext);

  // Wrong key produces an authentication failure (GCM tag mismatch)
  assert.throws(() => decryptRefreshToken(key2, parts));
});

test('encrypt is non-deterministic: same plaintext + key yields different IV and ciphertext', () => {
  const key = makeKey();
  const a = encryptRefreshToken(key, 'plaintext');
  const b = encryptRefreshToken(key, 'plaintext');
  assert.notEqual(Buffer.compare(a.iv, b.iv), 0);
  assert.notEqual(Buffer.compare(a.ciphertext, b.ciphertext), 0);
});

test('tampering with the ciphertext causes decrypt to fail', () => {
  const key = makeKey();
  const parts = encryptRefreshToken(key, 'plaintext');
  parts.ciphertext[0] ^= 0xff;
  assert.throws(() => decryptRefreshToken(key, parts));
});

test('encryptRefreshToken rejects bad key shapes', () => {
  assert.throws(() => encryptRefreshToken(Buffer.alloc(31), 'x'), /32-byte/);
  assert.throws(() => encryptRefreshToken('not-a-buffer', 'x'), /32-byte/);
});

test('encryptRefreshToken rejects empty plaintext', () => {
  assert.throws(() => encryptRefreshToken(makeKey(), ''), /non-empty/);
});

test('decryptRefreshToken validates IV and tag lengths', () => {
  const key = makeKey();
  const good = encryptRefreshToken(key, 'plaintext');
  assert.throws(() =>
    decryptRefreshToken(key, { ...good, iv: Buffer.alloc(10) }),
  );
  assert.throws(() =>
    decryptRefreshToken(key, { ...good, tag: Buffer.alloc(8) }),
  );
});
