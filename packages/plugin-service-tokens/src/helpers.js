export function buildListQuery(filters = {}) {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set('status', filters.status);
  }

  if (filters.groupEntityRef) {
    params.set('groupEntityRef', filters.groupEntityRef);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function defaultExpiryValue(now = Date.now()) {
  const expires = new Date(now + 30 * 24 * 60 * 60 * 1000);
  return expires.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm for <input type="datetime-local">
}

export function toDateTimeLocalValue(value) {
  if (!value) {
    return '';
  }

  return new Date(value).toISOString().slice(0, 10);
}

export function toIsoDateTime(value) {
  if (!value) {
    return '';
  }

  return new Date(value).toISOString();
}

export function formatDateTime(value) {
  if (!value) {
    return 'Never';
  }

  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
}

export function formatRelativeTime(value, now = Date.now()) {
  if (!value) {
    return 'Never';
  }

  const target = new Date(value).getTime();
  const deltaMs = target - now;
  const absDays = Math.round(Math.abs(deltaMs) / (24 * 60 * 60 * 1000));

  if (absDays === 0) {
    return deltaMs >= 0 ? 'today' : 'today';
  }

  if (deltaMs > 0) {
    return `in ${absDays} day${absDays === 1 ? '' : 's'}`;
  }

  return `${absDays} day${absDays === 1 ? '' : 's'} ago`;
}

export function getStatusChipColor(status) {
  switch (status) {
    case 'active':
      return 'primary';
    case 'expiring':
      return 'secondary';
    case 'expired':
      return 'secondary';
    case 'revoked':
      return 'default';
    default:
      return 'default';
  }
}

export function getStatusLabel(status) {
  switch (status) {
    case 'active':
      return 'Active';
    case 'expiring':
      return 'Expiring';
    case 'expired':
      return 'Expired';
    case 'revoked':
      return 'Revoked';
    default:
      return status;
  }
}

/** Backend rule: ^[a-z0-9-]{1,100}$ */
export const NAME_REGEX = /^[a-z0-9-]{1,100}$/;

export function validateName(name) {
  if (!name || name.trim().length === 0) {
    return 'Name is required';
  }
  if (!NAME_REGEX.test(name.trim())) {
    return 'Name must be 1–100 characters: lowercase letters, numbers, and hyphens only (no spaces)';
  }
  return null;
}

export function validateDescription(description) {
  const trimmed = (description ?? '').trim();
  if (trimmed.length < 1) {
    return 'Description is required';
  }
  if (trimmed.length > 500) {
    return 'Description must be 500 characters or fewer';
  }
  return null;
}

export function validateExpiresAt(value) {
  if (!value) {
    return 'Expiry date is required';
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return 'Expiry date is invalid';
  }
  if (d <= new Date()) {
    return 'Expiry date must be in the future';
  }
  return null;
}

export function isCreateFormValid(form) {
  return (
    validateName(form.name) === null &&
    validateDescription(form.description) === null &&
    Boolean(form.groupEntityRef.trim()) &&
    validateExpiresAt(form.expiresAt) === null &&
    form.scopes.length > 0
  );
}

export function groupEntityOptionToRef(option) {
  if (!option) {
    return '';
  }

  return `${option.kind.toLocaleLowerCase('en-US')}:${option.namespace}/${option.name}`;
}

export function mapGroupEntityOptions(entities = []) {
  return entities.map(entity => {
    const namespace = entity.metadata.namespace ?? 'default';
    const name = entity.metadata.name;
    const title = entity.metadata.title ?? name;

    return {
      kind: entity.kind,
      namespace,
      name,
      label: title,
      value: `${entity.kind.toLocaleLowerCase('en-US')}:${namespace}/${name}`,
      description: entity.spec?.type ? `type: ${entity.spec.type}` : '',
    };
  });
}
