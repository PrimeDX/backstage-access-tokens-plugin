export function normalizeGroupEntityRef(groupEntityRef) {
  if (typeof groupEntityRef !== 'string') {
    return undefined;
  }

  const trimmed = groupEntityRef.trim();
  if (!trimmed) {
    return undefined;
  }

  const [kindPart, restPart] = trimmed.includes(':')
    ? splitOnce(trimmed, ':')
    : [undefined, trimmed];

  if (kindPart && kindPart.toLocaleLowerCase('en-US') !== 'group') {
    return undefined;
  }

  const [namespacePart, namePart] = restPart.includes('/')
    ? splitOnce(restPart, '/')
    : ['default', restPart];

  if (!namespacePart || !namePart || namePart.includes('/')) {
    return undefined;
  }

  return `group:${namespacePart}/${namePart}`;
}

function splitOnce(value, separator) {
  const index = value.indexOf(separator);
  return [value.slice(0, index), value.slice(index + 1)];
}
