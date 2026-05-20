export const defaultScopes = [
  {
    id: 'catalog:read',
    description: 'Read access to the Software Catalog API',
    plugin: 'catalog',
  },
  {
    id: 'catalog:write',
    description: 'Write access to the Software Catalog API',
    plugin: 'catalog',
  },
  {
    id: 'techdocs:read',
    description: 'Read access to TechDocs',
    plugin: 'techdocs',
  },
  {
    id: 'scaffolder:read',
    description: 'Read access to Scaffolder templates and tasks',
    plugin: 'scaffolder',
  },
  {
    id: 'scaffolder:execute',
    description: 'Execute Scaffolder templates',
    plugin: 'scaffolder',
  },
];

export function getScopeCatalogue(additionalScopes = []) {
  return [...defaultScopes, ...additionalScopes];
}
