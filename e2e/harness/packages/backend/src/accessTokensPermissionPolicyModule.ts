import {
  AuthorizeResult,
  isPermission,
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
  policyExtensionPoint,
} from '@backstage/plugin-permission-node/alpha';
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import {
  serviceAccessTokensReadPermission,
  serviceAccessTokensWritePermission,
  serviceAccessTokensRevokePermission,
  personalAccessTokensReadPermission,
  personalAccessTokensWritePermission,
  personalAccessTokensRevokePermission,
} from '@primedx/plugin-access-tokens-node';
import { Config } from '@backstage/config';

class AccessTokensPermissionPolicy implements PermissionPolicy {
  constructor(private readonly config: Config) {}

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const adminRefs =
      this.config.getOptionalStringArray('accessTokens.service.admin.userEntityRefs') ?? [];
    const isAdmin = adminRefs.includes(user?.info.userEntityRef ?? '');

    if (
      isPermission(request.permission, serviceAccessTokensReadPermission) ||
      isPermission(request.permission, serviceAccessTokensWritePermission) ||
      isPermission(request.permission, serviceAccessTokensRevokePermission)
    ) {
      return { result: isAdmin ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
    }

    // User-tokens are self-service: any authenticated user can mint, list,
    // and revoke their own tokens. The spec's "default-open" policy.
    if (
      isPermission(request.permission, personalAccessTokensReadPermission) ||
      isPermission(request.permission, personalAccessTokensWritePermission) ||
      isPermission(request.permission, personalAccessTokensRevokePermission)
    ) {
      return { result: AuthorizeResult.ALLOW };
    }

    return { result: AuthorizeResult.ALLOW };
  }
}

export const accessTokensPermissionPolicyModule = createBackendModule({
  pluginId: 'permission',
  moduleId: 'access-tokens-policy',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        policy: policyExtensionPoint,
      },
      async init({ config, policy }) {
        policy.setPolicy(new AccessTokensPermissionPolicy(config));
      },
    });
  },
});
