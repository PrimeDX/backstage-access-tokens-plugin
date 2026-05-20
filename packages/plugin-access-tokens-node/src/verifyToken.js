import { buildSubject, sha256hex } from './primitives.js';

export async function verifyToken(token, { cache, db, logger }) {
  const hash = sha256hex(token);
  const cached = cache.get(hash);

  if (cached) {
    return { subject: cached.subject, scopes: cached.scopes ?? [] };
  }

  const record = await db.findActiveToken(hash);
  if (!record) {
    return undefined;
  }

  const subject = buildSubject(record.groupEntityRef, record.name);
  const scopes = record.scopes ?? [];

  cache.set(hash, { subject, scopes });

  Promise.resolve(db.updateLastUsed(record.id)).catch(error => {
    logger.warn(`Failed to update last_used_at: ${error.message}`);
  });

  return { subject, scopes };
}
