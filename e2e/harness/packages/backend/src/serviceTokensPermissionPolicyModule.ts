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
  serviceTokensReadPermission,
  serviceTokensWritePermission,
  serviceTokensRevokePermission,
} from '@primedx/plugin-service-tokens-node';
import { Config } from '@backstage/config';

class ServiceTokensPermissionPolicy implements PermissionPolicy {
  constructor(private readonly config: Config) {}

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const adminRefs =
      this.config.getOptionalStringArray('serviceTokens.admin.userEntityRefs') ?? [];
    const isAdmin = adminRefs.includes(user?.info.userEntityRef ?? '');

    if (
      isPermission(request.permission, serviceTokensReadPermission) ||
      isPermission(request.permission, serviceTokensWritePermission) ||
      isPermission(request.permission, serviceTokensRevokePermission)
    ) {
      return { result: isAdmin ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
    }

    return { result: AuthorizeResult.ALLOW };
  }
}

export const serviceTokensPermissionPolicyModule = createBackendModule({
  pluginId: 'permission',
  moduleId: 'service-tokens-policy',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        policy: policyExtensionPoint,
      },
      async init({ config, policy }) {
        policy.setPolicy(new ServiceTokensPermissionPolicy(config));
      },
    });
  },
});
