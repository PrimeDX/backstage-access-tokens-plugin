import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Decode a base64-encoded encryption key from configuration into a raw
 * 32-byte Buffer. Throws if the key is missing, malformed, or not the
 * required length — these errors should be fatal at plugin init so the
 * operator sees the problem immediately rather than at first mint.
 *
 * @param {string|undefined} base64Key The configured key value, expected
 *   to be the base64 encoding of exactly 32 raw bytes.
 * @returns {Buffer}
 */
export function decodeEncryptionKey(base64Key) {
  if (typeof base64Key !== 'string' || base64Key.length === 0) {
    throw new Error(
      'accessTokens.personal.encryptionKey is required to use the personal-access-token capability',
    );
  }

  let raw;
  try {
    raw = Buffer.from(base64Key, 'base64');
  } catch {
    throw new Error('accessTokens.personal.encryptionKey must be valid base64');
  }

  if (raw.length !== KEY_BYTES) {
    throw new Error(
      `accessTokens.personal.encryptionKey must decode to ${KEY_BYTES} bytes; got ${raw.length}`,
    );
  }

  return raw;
}

/**
 * Encrypt a plaintext refresh token under the supplied 32-byte key using
 * AES-256-GCM. The IV is freshly random for each call.
 *
 * @param {Buffer} key 32 raw bytes.
 * @param {string} plaintext The raw refresh token captured from the
 *   `/v1/token` JSON response.
 * @returns {{ ciphertext: Buffer, iv: Buffer, tag: Buffer }} Components
 *   suitable for direct insertion into the personal_access_tokens table.
 */
export function encryptRefreshToken(key, plaintext) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error('encryptRefreshToken requires a 32-byte Buffer key');
  }
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptRefreshToken requires a non-empty plaintext string');
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

/**
 * Decrypt the AES-256-GCM components retrieved from the personal_access_tokens table
 * back into the raw refresh token plaintext. Throws on authentication-tag
 * mismatch (key mismatch or ciphertext tampering).
 *
 * @param {Buffer} key 32 raw bytes.
 * @param {{ ciphertext: Buffer, iv: Buffer, tag: Buffer }} parts
 * @returns {string} The original plaintext.
 */
export function decryptRefreshToken(key, parts) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error('decryptRefreshToken requires a 32-byte Buffer key');
  }
  const { ciphertext, iv, tag } = parts ?? {};
  if (!Buffer.isBuffer(ciphertext) || !Buffer.isBuffer(iv) || !Buffer.isBuffer(tag)) {
    throw new Error('decryptRefreshToken requires Buffer ciphertext, iv, and tag');
  }
  if (iv.length !== IV_BYTES) {
    throw new Error(`decryptRefreshToken iv must be ${IV_BYTES} bytes`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(`decryptRefreshToken tag must be ${TAG_BYTES} bytes`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
