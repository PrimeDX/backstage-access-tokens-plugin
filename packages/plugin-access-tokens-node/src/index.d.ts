import type { BackendFeature } from '@backstage/backend-plugin-api';
import type { Permission, ResourcePermission } from '@backstage/plugin-permission-common';

declare const serviceAccessTokenHandlerModule: BackendFeature;
export declare const serviceTokenHandlerType: 'backstage-service-access-token';

export default serviceAccessTokenHandlerModule;
export { serviceAccessTokenHandlerModule };

export declare function createTokenCache(options?: {
  ttlSeconds?: number;
}): {
  get(key: string): { subject: string; scopes: string[] } | null;
  set(key: string, value: { subject: string; scopes?: string[] }): void;
  invalidate(key: string): void;
  clear(): void;
};

export declare function readServiceTokenAuthConfig(config: Record<string, unknown>): {
  cacheTtlSeconds: number;
};

export declare function createServiceTokenAuthDatabase(
  options: Record<string, unknown>,
): Record<string, unknown>;

export declare function buildSubject(
  groupEntityRef: string,
  tokenName: string,
): string;

export declare function sha256hex(value: string): string;

export declare const SERVICE_ACCESS_TOKEN_RESOURCE_TYPE: 'access-token-service';

export declare const serviceAccessTokensReadPermission: ResourcePermission<'access-token-service'>;
export declare const serviceAccessTokensWritePermission: ResourcePermission<'access-token-service'>;
export declare const serviceAccessTokensRevokePermission: ResourcePermission<'access-token-service'>;
export declare const serviceAccessTokensPermissions: ResourcePermission<'access-token-service'>[];

export declare const PERSONAL_ACCESS_TOKEN_RESOURCE_TYPE: 'access-token-user';

export declare const personalAccessTokensReadPermission: ResourcePermission<'access-token-user'>;
export declare const personalAccessTokensWritePermission: ResourcePermission<'access-token-user'>;
export declare const personalAccessTokensRevokePermission: ResourcePermission<'access-token-user'>;
export declare const personalAccessTokensPermissions: ResourcePermission<'access-token-user'>[];

export declare function createServiceTokenHandler(options: Record<string, unknown>): Record<string, unknown>;

export declare function createScopeResolver(
  cache: ReturnType<typeof createTokenCache>,
): (rawToken: string | null | undefined) => string[];

export declare function getServiceTokenScopeResolver(): ((rawToken: string) => string[]) | null;

export declare function verifyToken(
  token: string,
  options: Record<string, unknown>,
): Promise<{ subject: string; scopes: string[] } | undefined>;
