import { deriveStoredTokenFields, generateRawToken as defaultGenerateRawToken } from './tokens.js';

export async function createToken(input, options) {
  const now = options.now();
  const defaultTokenLifetimeDays = options.defaultTokenLifetimeDays ?? 365;
  const maxTokenLifetimeDays = options.maxTokenLifetimeDays ?? 365;
  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : addDays(now, defaultTokenLifetimeDays);
  const name = input.name ?? '';
  const description = input.description ?? '';
  const groupEntityRef = input.groupEntityRef ?? '';
  const allowedScopes = options.allowedScopes ?? input.scopes;

  if (!/^[a-z0-9-]{1,100}$/.test(name)) {
    throw createError(
      'VALIDATION_ERROR',
      'name must be 1-100 characters of lowercase letters, numbers, and hyphens',
    );
  }

  if (description.length < 1 || description.length > 500) {
    throw createError(
      'VALIDATION_ERROR',
      'description must be between 1 and 500 characters',
    );
  }

  if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
    throw createError('VALIDATION_ERROR', 'At least one scope is required');
  }

  if (!groupEntityRef) {
    throw createError('VALIDATION_ERROR', 'groupEntityRef is required');
  }

  if (input.scopes.some(scope => !allowedScopes.includes(scope))) {
    throw createError('VALIDATION_ERROR', 'All scopes must exist in the allowed scope catalogue');
  }

  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    throw createError('VALIDATION_ERROR', 'expiresAt must be in the future');
  }

  const maxExpiresAt = addDays(now, maxTokenLifetimeDays);
  if (expiresAt > maxExpiresAt) {
    throw createError(
      'VALIDATION_ERROR',
      `expiresAt must not exceed the configured maximum of ${maxTokenLifetimeDays} days`,
    );
  }

  if (options.ensureGroupExists) {
    const groupExists = await options.ensureGroupExists(groupEntityRef);
    if (!groupExists) {
      throw createError('VALIDATION_ERROR', 'groupEntityRef must reference an existing Group entity');
    }
  }

  const existing = await options.db.findTokenByName(groupEntityRef, name);
  if (existing) {
    throw createError('CONFLICT', 'A token with this name already exists for the group');
  }

  const rawToken = (options.generateRawToken ?? defaultGenerateRawToken)();
  const { tokenHash, tokenPrefix } = deriveStoredTokenFields(rawToken);

  const record = {
    id: options.generateId(),
    tokenHash,
    tokenPrefix,
    name,
    description,
    groupEntityRef,
    scopes: input.scopes,
    createdBy: options.createdBy,
    createdAt: now,
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    revokedBy: null,
  };

  await options.db.createTokenRecord(record);
  await options.db.appendAuditEvent({
    id: options.generateAuditId(),
    tokenId: record.id,
    event: 'created',
    actor: options.createdBy,
    metadata: {},
    occurredAt: now,
  });

  return {
    token: {
      id: record.id,
      name: record.name,
      description: record.description,
      tokenPrefix: record.tokenPrefix,
      groupEntityRef: record.groupEntityRef,
      scopes: record.scopes,
      createdBy: record.createdBy,
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
      status: 'active',
    },
    rawToken,
  };
}

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
