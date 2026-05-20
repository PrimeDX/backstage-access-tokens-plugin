import type { BackendFeature } from '@backstage/backend-plugin-api';

declare const accessTokensPlugin: BackendFeature;

export default accessTokensPlugin;
export { accessTokensPlugin };

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
