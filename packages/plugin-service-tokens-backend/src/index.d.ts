import type { BackendFeature } from '@backstage/backend-plugin-api';

declare const serviceTokensPlugin: BackendFeature;

export default serviceTokensPlugin;
export { serviceTokensPlugin };

export declare function createAuthorizedHttpApi(
  deps: Record<string, unknown>,
): Record<string, unknown>;
export declare function createKnexServiceTokenDatabase(
  options: Record<string, unknown>,
): Record<string, unknown>;
export declare function createInMemoryServiceTokenDatabase(
  options?: Record<string, unknown>,
): Record<string, unknown>;
export declare function applyServiceTokenMigrations(client: unknown): Promise<void>;
