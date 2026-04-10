export async function revokeToken(id, options) {
  const reason = options.reason?.trim() ?? '';
  if (reason.length < 1 || reason.length > 500) {
    throw createError(
      'VALIDATION_ERROR',
      'reason must be between 1 and 500 characters',
    );
  }

  const token = await options.db.getTokenRecord(id);
  if (!token) {
    throw createError('NOT_FOUND', 'Token not found');
  }

  if (token.revokedAt) {
    throw createError('CONFLICT', 'Token already revoked');
  }

  const revokedAt = options.now();

  await options.db.revokeTokenRecord(id, {
    revokedAt,
    revokedBy: options.revokedBy,
    reason,
  });
  await options.db.appendAuditEvent({
    id: options.generateAuditId(),
    tokenId: id,
    event: 'revoked',
    actor: options.revokedBy,
    metadata: { reason },
    occurredAt: revokedAt,
  });
}

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
