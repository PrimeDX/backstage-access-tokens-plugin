import crypto from 'node:crypto';

export function sha256hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function buildSubject(groupEntityRef, tokenName) {
  return `service-token:${groupEntityRef}:${tokenName}`;
}
