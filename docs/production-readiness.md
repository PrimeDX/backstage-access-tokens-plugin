# Production Readiness Guide

Audience: platform engineers preparing the plugin for production Backstage environments.

Use this guide after installation is working and you are ready to harden policy, cache behavior, and operational practices.

This guide covers what you need to verify, configure, and decide before running the service token plugin in a production Backstage deployment. It assumes you have already completed the [Getting Started](getting-started.md) walkthrough.

---

## Pre-flight checklist

Run through this before going live. Each item links to the relevant section below.

- [ ] Default auth policy is **enabled** — `dangerouslyDisableDefaultAuthPolicy` is not set to `true` in production config
- [ ] `serviceTokens.admin.userEntityRefs` is set to an explicit list — the development default (`user:development/guest`) is not present in production config
- [ ] Admin access is granted to a **group or role**, not just individual users (see [Admin access via catalog groups](#admin-access-via-catalog-groups))
- [ ] Your permission policy handles `service-tokens:read`, `service-tokens:write`, and `service-tokens:revoke` — either as a standalone policy or merged into an existing one (see [Merging into an existing permission policy](#merging-into-an-existing-permission-policy))
- [ ] `serviceTokens.cacheTtlSeconds` is tuned to match your revocation SLO (see [Cache TTL and revocation SLO](#cache-ttl-and-revocation-slo))
- [ ] `serviceTokens.maxTokenLifetimeDays` is set to a value appropriate for your security policy
- [ ] Audit log retention is understood and covered by your logging infrastructure (see [Audit log retention](#audit-log-retention))
- [ ] At least one smoke test has been run against the production backend (see [Getting Started](getting-started.md) for the smoke-test flow in Step 7)

---

## Admin access via catalog groups

The getting-started guide shows the simplest possible permission policy: a flat list of user entity refs in `app-config.yaml`. This works for small teams but breaks down quickly — every personnel change requires a config edit and a backend restart.

The better approach is to grant admin access to a **Backstage catalog group**. Any user who is a member of that group (as resolved by the catalog) gets admin access automatically.

### Why this is better

- Group membership is managed in your catalog (LDAP, GitHub teams, etc.) — no config changes needed when people join or leave
- Works with any Backstage auth provider (Auth0, Okta, GitHub OAuth, Google, etc.) — the catalog is the source of truth, not the IdP
- Scales to large teams without growing a config list

### Implementation

This requires the `catalogApi` service in your permission policy. The policy fetches the user's group memberships from the catalog and checks whether the designated admin group is among them.

```typescript
// packages/backend/src/serviceTokensPermissionPolicy.ts
import {
  AuthorizeResult,
  isPermission,
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import { CatalogApi } from '@backstage/catalog-client';
import {
  serviceTokensReadPermission,
  serviceTokensWritePermission,
  serviceTokensRevokePermission,
} from '@primedx/plugin-service-tokens-node';
import { Config } from '@backstage/config';

export class ServiceTokensPermissionPolicy implements PermissionPolicy {
  constructor(
    private readonly config: Config,
    private readonly catalogApi: CatalogApi,
  ) {}

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    if (
      isPermission(request.permission, serviceTokensReadPermission) ||
      isPermission(request.permission, serviceTokensWritePermission) ||
      isPermission(request.permission, serviceTokensRevokePermission)
    ) {
      const allowed = await this.isAdminUser(user);
      return allowed
        ? { result: AuthorizeResult.ALLOW }
        : { result: AuthorizeResult.DENY };
    }

    return { result: AuthorizeResult.ALLOW };
  }

  private async isAdminUser(user?: PolicyQueryUser): Promise<boolean> {
    if (!user?.info.userEntityRef) return false;

    // Option A: explicit user list (simple, good for small teams)
    const adminRefs =
      this.config.getOptionalStringArray('serviceTokens.admin.userEntityRefs') ?? [];
    if (adminRefs.includes(user.info.userEntityRef)) return true;

    // Option B: group membership (recommended for teams)
    const adminGroup = this.config.getOptionalString('serviceTokens.admin.groupEntityRef');
    if (!adminGroup) return false;

    const userEntity = await this.catalogApi.getEntityByRef(
      user.info.userEntityRef,
      { token: user.token },
    );

    if (!userEntity) return false;

    // Backstage stores group memberships on the user entity as relations
    const memberOfRefs = (userEntity.relations ?? [])
      .filter(r => r.type === 'memberOf')
      .map(r => r.targetRef);

    return memberOfRefs.includes(adminGroup);
  }
}
```

Register the policy with the catalog API injected:

```typescript
// packages/backend/src/index.ts
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { ServiceTokensPermissionPolicy } from './serviceTokensPermissionPolicy';

const permissionModuleServiceTokens = createBackendModule({
  pluginId: 'permission',
  moduleId: 'service-tokens-policy',
  register(reg) {
    reg.registerInit({
      deps: {
        policy: policyExtensionPoint,
        config: coreServices.rootConfig,
        catalog: catalogServiceRef,
      },
      async init({ policy, config, catalog }) {
        policy.setPolicy(new ServiceTokensPermissionPolicy(config, catalog));
      },
    });
  },
});

backend.add(permissionModuleServiceTokens);
```

Configure the admin group in `app-config.yaml`:

```yaml
serviceTokens:
  admin:
    # Option A: explicit users (can be combined with Option B)
    userEntityRefs:
      - user:default/alice

    # Option B: group membership (recommended)
    groupEntityRef: group:default/platform-team
```

> **Note:** You can use both options simultaneously — the policy above checks the user list first, then falls back to group membership. This is useful during a migration from a flat list to group-based access.

### Caveats

- Group membership is resolved at request time via a catalog API call. This adds a small latency cost per admin API request. For the typical admin UI usage pattern (low-frequency, human-driven), this is negligible.
- The `memberOf` relations on a user entity are populated by your catalog ingestion pipeline (e.g., GitHub Teams processor, LDAP processor). If your catalog is not ingesting group memberships, the group check will always return false. Verify with `GET /api/catalog/entities/by-ref/user:default/<your-user>` and inspect the `relations` array.
- Backstage resolves only **direct** group memberships via `memberOf` relations by default. Nested group hierarchies (group A is a member of group B) require additional traversal logic if needed.

---

## Merging into an existing permission policy

Backstage supports **exactly one active permission policy** at a time. If your app already has a permission policy (from another plugin, a platform team, or a third-party integration), you cannot register a second one — the second `policy.setPolicy()` call will throw.

### The problem

The getting-started guide shows creating a new `ServiceTokensPermissionPolicy`. If you already have a policy, this will conflict.

### The solution: merge, don't replace

Add the service token permission checks to your existing policy's `handle` method:

```typescript
// packages/backend/src/myExistingPermissionPolicy.ts
import { isPermission } from '@backstage/plugin-permission-common';
import {
  serviceTokensReadPermission,
  serviceTokensWritePermission,
  serviceTokensRevokePermission,
} from '@primedx/plugin-service-tokens-node';

// BEFORE — your existing policy
class MyExistingPolicy implements PermissionPolicy {
  async handle(request, user) {
    if (isPermission(request.permission, myPluginPermission)) {
      // ... your existing logic
    }
    return { result: AuthorizeResult.ALLOW };
  }
}

// AFTER — with service token permissions merged in
class MyExistingPolicy implements PermissionPolicy {
  constructor(private readonly config: Config) {}

  async handle(request, user) {
    // Add this block — order doesn't matter, each permission is checked independently
    if (
      isPermission(request.permission, serviceTokensReadPermission) ||
      isPermission(request.permission, serviceTokensWritePermission) ||
      isPermission(request.permission, serviceTokensRevokePermission)
    ) {
      const adminRefs =
        this.config.getOptionalStringArray('serviceTokens.admin.userEntityRefs') ?? [];
      return adminRefs.includes(user?.info.userEntityRef ?? '')
        ? { result: AuthorizeResult.ALLOW }
        : { result: AuthorizeResult.DENY };
    }

    // Your existing logic below — unchanged
    if (isPermission(request.permission, myPluginPermission)) {
      // ...
    }

    return { result: AuthorizeResult.ALLOW };
  }
}
```

### If you use a third-party or generated policy

Some Backstage setups use a policy generated by a platform tool (e.g., Roadie, Janus, or an internal policy-as-code system). In these cases:

1. Check whether the tool supports a plugin extension point for adding custom permission checks.
2. If not, wrap the generated policy: create a thin `WrappedPolicy` that handles the service token permissions itself and delegates everything else to the generated policy.

```typescript
import {
  serviceTokensReadPermission,
  serviceTokensWritePermission,
  serviceTokensRevokePermission,
} from '@primedx/plugin-service-tokens-node';

class WrappedPolicy implements PermissionPolicy {
  constructor(
    private readonly inner: PermissionPolicy,
    private readonly config: Config,
  ) {}

  async handle(request, user) {
    if (
      isPermission(request.permission, serviceTokensReadPermission) ||
      isPermission(request.permission, serviceTokensWritePermission) ||
      isPermission(request.permission, serviceTokensRevokePermission)
    ) {
      const adminRefs =
        this.config.getOptionalStringArray('serviceTokens.admin.userEntityRefs') ?? [];
      return adminRefs.includes(user?.info.userEntityRef ?? '')
        ? { result: AuthorizeResult.ALLOW }
        : { result: AuthorizeResult.DENY };
    }
    return this.inner.handle(request, user);
  }
}
```

> **Do not** register two separate backend modules that each call `policy.setPolicy()`. The second call will throw at startup.

---

## Cache TTL and revocation SLO

The plugin caches verified tokens in memory for `serviceTokens.cacheTtlSeconds` seconds (default: 60). This means a revoked token continues to be accepted for up to that many seconds on any replica that has a cached entry.

### Setting your revocation SLO

Your revocation SLO is the maximum time between an admin revoking a token and that token being rejected on all replicas:

```
Revocation SLO = serviceTokens.cacheTtlSeconds
```

Choose a value based on your security requirements:

| Scenario | Recommended TTL | Trade-off |
|---|---|---|
| Internal tooling, low sensitivity | 300s (5 min) | Fewer DB reads, slower revocation |
| Standard production | 60s (default) | Balanced |
| Compliance-sensitive, post-incident | 10–30s | More DB reads, faster revocation |
| Disable caching entirely | 0 | Every request hits the DB — not recommended for production |

```yaml
serviceTokens:
  cacheTtlSeconds: 60   # adjust to match your revocation SLO
```

### Multi-replica deployments

Each replica maintains its own in-memory cache. There is no cross-replica cache invalidation. When you revoke a token:

- Replicas that have the token cached will continue accepting it until their cache entry expires
- Replicas that do not have the token cached will reject it immediately on the next request

**Implication:** In a 3-replica deployment with `cacheTtlSeconds: 60`, a revoked token may be accepted for up to 60 seconds on any replica that has it cached. Document this in your incident response runbook.

### Expiry vs. revocation

Token expiry (`expires_at`) is checked on every DB lookup and on every cache hit — the cache stores the expiry timestamp and checks it on read. Expired tokens are rejected immediately regardless of cache TTL. Revocation is the only case where the cache TTL creates a window.

---

## Audit log retention

The plugin writes two event types to the `service_token_audit_log` table:

| Event | When | What's stored |
|---|---|---|
| `created` | Token creation | Token ID, actor (user entity ref), timestamp |
| `revoked` | Token revocation | Token ID, actor, timestamp, optional reason |

### What the plugin does NOT do

- It does not rotate or purge audit log entries. The table grows indefinitely.
- It does not ship audit events to an external system (Splunk, Datadog, CloudWatch, etc.).
- It does not enforce a retention policy.

### What you need to add

**Database-level retention:** If your compliance policy requires audit log retention for a defined period (e.g., 90 days, 1 year), implement a scheduled job or database policy to purge rows older than your retention window:

```sql
-- Example: delete audit log entries older than 1 year
DELETE FROM service_token_audit_log
WHERE occurred_at < NOW() - INTERVAL '1 year';
```

Run this as a scheduled task (cron, Kubernetes CronJob, database scheduled event) at a frequency appropriate for your data volume.

**External log shipping:** For compliance or SIEM integration, consider shipping audit events to your logging infrastructure. Options:

- **Database CDC (Change Data Capture):** Stream inserts from `service_token_audit_log` to your log aggregator using Debezium, AWS DMS, or equivalent.
- **Backstage audit log integration:** If your Backstage deployment uses `@backstage/backend-plugin-audit-log-node`, you can extend the backend plugin to emit structured audit events through that system. This requires a code change to `plugin-service-tokens-backend`.
- **Periodic export:** A scheduled job that queries `service_token_audit_log WHERE occurred_at > :last_run` and ships rows to your SIEM.

### What to retain

At minimum, retain:

- All `created` events for the lifetime of the token plus your retention window
- All `revoked` events indefinitely (or per your compliance policy)
- The `actor` field — this is the user entity ref of the person who performed the action, not a raw username. Ensure your identity provider maps this ref to a real person in your audit trail.

---

## Auth provider compatibility

This plugin is **auth provider agnostic**. Whether your Backstage instance uses Auth0, Okta, GitHub OAuth, Google, Microsoft Azure AD, or any other provider, the plugin behaves identically.

The reason: the plugin's admin UI requires a valid Backstage user token, which Backstage's auth layer issues after the user authenticates via your configured provider. The plugin never interacts with the IdP directly — it only sees the Backstage-issued token and the user entity ref that Backstage resolves from it.

For auth provider setup, follow the [Backstage auth provider documentation](https://backstage.io/docs/auth/) for your specific provider. No plugin-specific configuration is needed.

---

## User tokens — operational concerns

If you enabled the optional user-tokens capability
([Getting Started §Step 8](getting-started.md#step-8--optional-enable-user-tokens),
[Configuration §User tokens](configuration.md#user-tokens)), there
are a few production concerns that don't apply to service tokens.

### Encryption key management

The plugin uses `serviceTokens.userTokens.encryptionKey` to encrypt
refresh tokens at rest with AES-256-GCM. The same key is needed at
revoke time to decrypt the ciphertext and present the raw token to
RFC 7009 `/v1/revoke`.

**Treat the key as a top-tier secret**, equivalent to your
Backstage backend signing key:

- Generate per environment (`openssl rand -base64 32`); never reuse
  across environments.
- Store in a secret manager (Vault, AWS Secrets Manager, KMS-backed
  parameter store), not in a checked-in config file. Reference it
  in `app-config.yaml` via Backstage's standard secret resolution
  (`${USER_TOKENS_ENCRYPTION_KEY}`).
- Back up the key alongside your database backups. If you restore
  a DB backup but lose the key, revocation breaks for every row
  whose ciphertext was encrypted under the lost key.

### Key rotation

The v1 plugin does not ship a rotation tool. To rotate today:

1. Add the new key as a secondary variable; keep the old key.
2. Run an out-of-band script that, for each row in `user_tokens`,
   decrypts with the old key and re-encrypts with the new key.
3. Atomically swap `serviceTokens.userTokens.encryptionKey` to the
   new value. Restart the backend.
4. Retire the old key after one rotation cycle.

A first-party rotation script is a tracked follow-up.

### Token-count limits

The plugin does not enforce a per-user cap of its own. Upstream
Backstage `auth.experimentalRefreshToken.maxTokensPerUser` (default
**20**) is the operative limit — `OfflineAccessService` will reject
new mint attempts once a user is at the cap. Communicate the limit
to your users in onboarding docs or wire a UI affordance to remind
them.

### Refresh-token audit

The plugin audits **its own** mint and revoke events
(`user_token_audit_log`). It does NOT audit each `/api/auth/v1/token`
exchange — that traffic is observable only through Backstage's
standard request logging. If you need a per-exchange audit trail
(who used which token from which IP, when), enable structured
logging on the auth-backend or proxy `/v1/token` through your own
audit-emitting layer.

### Loss of the encryption key

If the key is permanently lost:

- Existing minted tokens **continue to work** for the user's
  scripts (auth-backend itself still has the refresh-token hash).
- The plugin **cannot revoke** them through `/v1/revoke` (it can't
  decrypt the stored ciphertext). The UI revoke button returns a
  5xx error and the row stays `active`.
- Mitigation in this state: ask affected users to revoke via the
  standard Backstage `/v1/revoke` if they still have their raw
  token, or wait for natural expiry (default 30 days). Out-of-band
  admin actions can also call `OfflineAccessService` revocation
  directly — see Backstage's auth-backend admin tooling.

---

## Production go-live checklist

A final checklist to run before cutting over to production traffic.

### Configuration (service tokens)

- [ ] `backend.auth.dangerouslyDisableDefaultAuthPolicy` is **not** set to `true`
- [ ] `serviceTokens.admin.userEntityRefs` or `serviceTokens.admin.groupEntityRef` is set to a production value (not the development default)
- [ ] `serviceTokens.maxTokenLifetimeDays` is set to a value that matches your security policy
- [ ] `serviceTokens.cacheTtlSeconds` is set and documented as your revocation SLO
- [ ] Database is configured to use Postgres or MySQL (not SQLite) for production

### Configuration (user tokens — if enabled)

- [ ] `auth.experimentalDynamicClientRegistration.enabled` and `auth.experimentalRefreshToken.enabled` are both `true`
- [ ] `serviceTokens.userTokens.encryptionKey` is 32 bytes base64, sourced from your secret manager, not committed to source control
- [ ] `serviceTokens.userTokens.maxExpiryDays` ≤ `auth.experimentalRefreshToken.maxRotationLifetime`
- [ ] The encryption key is backed up alongside DB backups
- [ ] `@backstage/plugin-auth` is wired into `packages/app/src/App.tsx` so the consent route `/oauth2/authorize/:sessionId` resolves
- [ ] The permission policy explicitly handles `user-tokens:read/write/revoke`

### Permission policy

- [ ] The `service-tokens:read`, `service-tokens:write`, and `service-tokens:revoke` permissions are handled in your active permission policy
- [ ] Only one `policy.setPolicy()` call exists in your backend
- [ ] The policy has been tested: admin user gets `200`, non-admin user gets `403`

### Operational

- [ ] Audit log retention policy is defined and implemented
- [ ] Revocation SLO is documented in your incident response runbook
- [ ] At least one admin user can access `/admin/service-tokens` in production
- [ ] A smoke test token has been created, used, and revoked successfully
- [ ] Token rotation process is documented for your team

### Security

- [ ] No raw tokens are stored in logs, config files, or environment variables
- [ ] The admin user list (or group) is reviewed and limited to the minimum necessary
- [ ] `serviceTokens.maxTokenLifetimeDays` is set — tokens do not live forever by default, but verify this matches your policy
