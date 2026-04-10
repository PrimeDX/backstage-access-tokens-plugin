import type { BackendFeature } from '@backstage/backend-plugin-api';
import type { Permission, ResourcePermission } from '@backstage/plugin-permission-common';

declare const serviceTokenHandlerModule: BackendFeature;
export declare const serviceTokenHandlerType: 'backstage-service-token';

export default serviceTokenHandlerModule;
export { serviceTokenHandlerModule };

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

export declare const SERVICE_TOKEN_RESOURCE_TYPE: 'service-token';

export declare const serviceTokensReadPermission: ResourcePermission<'service-token'>;
export declare const serviceTokensWritePermission: ResourcePermission<'service-token'>;
export declare const serviceTokensRevokePermission: ResourcePermission<'service-token'>;
export declare const serviceTokensPermissions: ResourcePermission<'service-token'>[];

/** @deprecated Use serviceTokensReadPermission, serviceTokensWritePermission, or serviceTokensRevokePermission instead. */
export declare const serviceTokensAdminPermission: ResourcePermission<'service-token'>;

export declare function createServiceTokenHandler(options: Record<string, unknown>): Record<string, unknown>;

export declare function createScopeResolver(
  cache: ReturnType<typeof createTokenCache>,
): (rawToken: string | null | undefined) => string[];

export declare function getServiceTokenScopeResolver(): ((rawToken: string) => string[]) | null;

export declare function verifyToken(
  token: string,
  options: Record<string, unknown>,
): Promise<{ subject: string; scopes: string[] } | undefined>;
