import crypto from 'node:crypto';

export function generateRawToken() {
  return `bsat_${crypto.randomBytes(32).toString('base64url')}`;
}

export function deriveStoredTokenFields(rawToken) {
  return {
    tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
    tokenPrefix: rawToken.slice(0, 12),
  };
}
