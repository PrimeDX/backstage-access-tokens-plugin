# Getting Started

Audience: platform engineers wiring the plugin into an existing Backstage app.

Use this guide when your Backstage app already exists and you want the shortest supported path to installation, configuration, and a working smoke test.

This guide walks a platform engineer through installing and wiring the service token plugin into an existing Backstage application. By the end you will have:

- The backend plugin running and serving the REST API at `/api/service-tokens`
- The external auth handler registered so raw service tokens are accepted by Backstage's auth layer
- The frontend admin UI accessible at `/admin/service-tokens`
- A permission policy that controls who can manage tokens
- A working smoke test confirming the full flow

---

## Prerequisites

- A working Backstage app using the **new backend system** (`createBackend`) and the **new frontend system** (`createApp`)
- Node.js 22
- The plugin workspace cloned or copied alongside your Backstage monorepo

### Default auth policy

Backstage's default auth policy validates every inbound token before your route handlers run. It is **active by default** in any app using `createBackend()` — no extra package is required.

> **Do not** set `backend.auth.dangerouslyDisableDefaultAuthPolicy: true` in production. This plugin's service token verification depends on the default auth policy being active.

If you are new to Backstage's auth system, the [Auth service overview](https://backstage.io/docs/backend-system/core-services/auth) is a good starting point.

### Permission framework

The plugin enforces three granular permissions (`service-tokens:read`, `service-tokens:write`, `service-tokens:revoke`) on its API endpoints. This requires the Backstage permission framework to be installed in your backend.

If you haven't set it up yet, install the permission backend:

```bash
yarn --cwd packages/backend add @backstage/plugin-permission-backend
```

Then register it in your backend entry point:

```typescript
// packages/backend/src/index.ts
backend.add(import('@backstage/plugin-permission-backend'));
```

See the [Permission framework overview](https://backstage.io/docs/permissions/overview) for full setup details. Step 4 of this guide shows how to wire a permission policy specifically for this plugin.

> **If you already have a permission policy**, you do not need a separate install — just add the service token permission checks to your existing policy (see Step 4).

### Auth provider (development)

The smoke test in Step 7 uses the **guest auth provider** to obtain a short-lived user token:

```bash
curl -s -X POST http://localhost:7007/api/auth/guest/refresh ...
```

The guest provider is enabled by default in development (`app-config.local.yaml`). If your app uses a different provider (GitHub, Google, etc.), substitute the appropriate token-fetch command. See [Auth provider configuration](https://backstage.io/docs/auth/) for options.

---

## Step 1 — Add the packages

The plugin ships three published packages. Add them to your Backstage monorepo:

```bash
yarn --cwd packages/backend add @primedx/plugin-service-tokens-backend
yarn --cwd packages/backend add @primedx/plugin-service-tokens-node
yarn --cwd packages/app add @primedx/plugin-service-tokens
```

---

## Step 2 — Register the backend plugin

Open your backend entry point and add both the plugin and the auth handler module.

```typescript
// packages/backend/src/index.ts
import { createBackend } from '@backstage/backend-defaults';
import { serviceTokensPlugin } from '@primedx/plugin-service-tokens-backend';
import { serviceTokenHandlerModule } from '@primedx/plugin-service-tokens-node';

const backend = createBackend();

// ... your other plugins ...

backend.add(serviceTokensPlugin);
backend.add(serviceTokenHandlerModule);

backend.start();
```

**Why two registrations?**

- `serviceTokensPlugin` provides the REST API and manages the token database.
- `serviceTokenHandlerModule` registers the `backstage-service-token` external auth handler with Backstage's `core.auth` service. This is what makes raw service tokens accepted as valid credentials on any backend route. It must be registered as a service factory — not a module init hook — because `core.auth` is constructed before module init hooks run.

---

## Step 3 — Register the frontend plugin

```typescript
// packages/app/src/App.tsx
import { createApp } from '@backstage/frontend-defaults';
import serviceTokensPlugin from '@primedx/plugin-service-tokens';

const app = createApp({
  features: [
    // ... your other plugins ...
    serviceTokensPlugin,
  ],
});

export default app.createRoot();
```

The plugin registers the admin service-tokens page at
`/admin/service-tokens` and, when user tokens are enabled, contributes
a `Personal Access Tokens` tab under Backstage user settings at
`/settings/personal-tokens`. No additional route configuration is
required.

---

## Step 4 — Add a permission policy

The plugin exposes three granular permissions:

| Permission | Action | Routes |
|---|---|---|
| `service-tokens:read` | List tokens, get token details, view audit logs, list scopes | `GET /`, `GET /:id`, `GET /:id/audit`, `GET /scopes` |
| `service-tokens:write` | Create tokens | `POST /` |
| `service-tokens:revoke` | Revoke tokens | `DELETE /:id` |

All three are `ResourcePermission<'service-token'>`, which means they are compatible with Backstage RBAC plugins and support conditional (group-scoped) policies.

> **Prerequisite:** Your backend must have the permission framework installed. If you haven't already, add it:
>
> ```typescript
> // packages/backend/src/index.ts
> backend.add(import('@backstage/plugin-permission-backend'));
> ```
>
> See the [Backstage permission framework documentation](https://backstage.io/docs/permissions/overview) for full setup details.

Scope-level authorization remains consumer-driven: if you need route-level enforcement for token scopes, implement checks in the plugins/policies that own those routes.

For an optional operator-oriented implementation baseline, see the [Scope Enforcement Runbook](runbooks/scope-enforcement.md).

Create (or update) your permission policy:

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
import {
  serviceTokensReadPermission,
  serviceTokensWritePermission,
  serviceTokensRevokePermission,
} from '@primedx/plugin-service-tokens-node';
import { Config } from '@backstage/config';

export class ServiceTokensPermissionPolicy implements PermissionPolicy {
  constructor(private readonly config: Config) {}

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const adminRefs =
      this.config.getOptionalStringArray(
        'serviceTokens.admin.userEntityRefs',
      ) ?? [];

    const isAdmin = adminRefs.includes(user?.info.userEntityRef ?? '');

    // Grant all three service token permissions to admin users
    if (
      isPermission(request.permission, serviceTokensReadPermission) ||
      isPermission(request.permission, serviceTokensWritePermission) ||
      isPermission(request.permission, serviceTokensRevokePermission)
    ) {
      return { result: isAdmin ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
    }

    // Allow all other permissions — adjust to match your existing policy
    return { result: AuthorizeResult.ALLOW };
  }
}
```

> **Granular example — read-only auditor:**
>
> ```typescript
> // Grant read to auditors, but deny write and revoke
> if (isPermission(request.permission, serviceTokensReadPermission)) {
>   return { result: isAuditor ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
> }
> if (
>   isPermission(request.permission, serviceTokensWritePermission) ||
>   isPermission(request.permission, serviceTokensRevokePermission)
> ) {
>   return { result: isAdmin ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
> }
> ```

Register the policy in your backend:

```typescript
// packages/backend/src/index.ts
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import { ServiceTokensPermissionPolicy } from './serviceTokensPermissionPolicy';

const permissionModuleServiceTokens = createBackendModule({
  pluginId: 'permission',
  moduleId: 'service-tokens-policy',
  register(reg) {
    reg.registerInit({
      deps: {
        policy: policyExtensionPoint,
        config: coreServices.rootConfig,
      },
      async init({ policy, config }) {
        policy.setPolicy(new ServiceTokensPermissionPolicy(config));
      },
    });
  },
});

backend.add(permissionModuleServiceTokens);
```

> **If you already have a permission policy**, add the service token permission checks to your existing `handle` method rather than creating a new policy. Backstage only supports one active permission policy at a time.

---

## Step 5 — Configure

Add the minimum required configuration to `app-config.yaml`:

```yaml
serviceTokens:
  admin:
    userEntityRefs:
      - user:default/alice   # replace with your admin user entity refs
```

This grants the service token permissions to the listed users. Users not in this list will receive `403 Forbidden` when accessing any service token endpoint.

For all available configuration options, see the [Configuration Reference](configuration.md).

---

## Step 6 — Configure the database (optional)

By default, the plugin uses whatever database your Backstage backend is configured to use. The plugin runs its own migrations automatically on startup — no manual schema setup is required.

For development with SQLite, you may want a dedicated database file to avoid conflicts with the in-memory default:

```yaml
# app-config.local.yaml (dev only — do not commit)
backend:
  database:
    plugin:
      service-tokens:
        connection: '/tmp/service-tokens.sqlite'
```

For production, the plugin works with any Knex-compatible database (Postgres, MySQL) that your Backstage backend is already configured to use.

---

## Step 7 — Smoke test

Start your backend and frontend, then verify the plugin is working.

**Get a Backstage identity token:**

```bash
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' \
  | jq -r '.backstageIdentity.token')
```

**List available scopes:**

```bash
curl -s http://localhost:7007/api/service-tokens/scopes \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected response:

```json
{
  "scopes": [
    { "id": "catalog:read", "description": "Read access to the Software Catalog API", "plugin": "catalog" },
    { "id": "catalog:write", "description": "Write access to the Software Catalog API", "plugin": "catalog" },
    { "id": "techdocs:read", "description": "Read access to TechDocs", "plugin": "techdocs" },
    { "id": "scaffolder:read", "description": "Read access to Scaffolder templates and tasks", "plugin": "scaffolder" },
    { "id": "scaffolder:execute", "description": "Execute Scaffolder templates", "plugin": "scaffolder" }
  ]
}
```

**Create a token:**

```bash
curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "smoke-test",
    "description": "Smoke test token",
    "groupEntityRef": "group:default/your-group",
    "scopes": ["catalog:read"],
    "expiresInDays": 30
  }' | jq .
```

You should receive a `token` object and a `rawToken` string. The raw token is shown only once.

**Navigate to the UI:**

Open `http://localhost:3000/admin/service-tokens` in your browser. The token you just created should appear in the table.

---

## Step 8 — (Optional) Enable user tokens

The plugin family also offers **user-self-service personal access
tokens** as a separate capability. Service tokens (covered above) are
admin-managed and authenticate as a group; user tokens are minted by
each user from `Settings` → `Personal Access Tokens`
(`/settings/personal-tokens`) and authenticate as the user themselves
against every Backstage backend plugin.

User tokens are opt-in. Service-token behavior is unchanged whether
you enable them or not.

### 8.1 Enable the upstream Backstage flags

Add the following to `app-config.yaml`:

```yaml
auth:
  experimentalDynamicClientRegistration:
    enabled: true
  experimentalRefreshToken:
    enabled: true
```

These enable [Dynamic Client Registration](https://www.rfc-editor.org/rfc/rfc7591)
and [refresh tokens](https://www.rfc-editor.org/rfc/rfc6749#section-1.5)
in `@backstage/plugin-auth-backend`. Without both flags the
user-tokens routes log a warning at boot and stay unmounted.

### 8.2 Generate an encryption key

```bash
openssl rand -base64 32
```

Paste the value into `app-config.yaml`:

```yaml
serviceTokens:
  userTokens:
    encryptionKey: '<base64 of 32 random bytes>'
```

The plugin uses this key to encrypt refresh tokens at rest in the
plugin DB (AES-256-GCM). The key is needed at revocation time to
call `/v1/revoke` with the decrypted token. Losing the key
permanently breaks UI revocation for in-flight tokens; rotate
carefully (see [Production Readiness](production-readiness.md)).

### 8.3 Wire the auth-consent plugin into the frontend

The OAuth consent route at `/oauth2/authorize/:sessionId` is
provided by `userTokensAuthPlugin`, a named export from the
frontend package. Add it alongside the main service-tokens frontend
feature:

```ts
// packages/app/src/App.tsx
import serviceTokensPlugin, {
  userTokensAuthPlugin,
} from '@primedx/plugin-service-tokens';

export default createApp({
  features: [userTokensAuthPlugin, /* …, */ serviceTokensPlugin],
});
```

Without this, the mint flow's same-tab redirect to
`/oauth2/authorize/:sessionId` hits a 404.

Do not register both `userTokensAuthPlugin` and Backstage's stock
auth-consent frontend for `/oauth2` unless your app intentionally
handles the route conflict another way.

### 8.4 Permit the user-tokens permissions

If your `PermissionPolicy` has explicit handling for service-tokens
permissions, add a parallel block for user-tokens. The spec's
"default-open" rule is: every authenticated user can mint, list,
and revoke their own tokens.

```ts
import {
  userTokensReadPermission,
  userTokensWritePermission,
  userTokensRevokePermission,
} from '@primedx/plugin-service-tokens-node';

// inside your PermissionPolicy.handle:
if (
  isPermission(request.permission, userTokensReadPermission) ||
  isPermission(request.permission, userTokensWritePermission) ||
  isPermission(request.permission, userTokensRevokePermission)
) {
  return { result: AuthorizeResult.ALLOW };
}
```

### 8.5 Smoke-check user tokens

After restarting the backend you should see this log line at boot:

```
service-tokens info user-tokens capability enabled at /api/service-tokens/personal/tokens
```

Then in the browser:

1. Sign in to Backstage.
2. Navigate to `Settings` → `Personal Access Tokens`
   (`/settings/personal-tokens`).
3. Click **Create token**, enter a name, click Create.
4. The page navigates to a Backstage consent screen (same tab).
   Click Authorize.
5. The page returns to `/settings/personal-tokens` and a dialog
   automatically opens with the raw refresh token. Copy it.

Use the token from a script:

```bash
# Exchange refresh token for a short-lived JWT
JWT=$(curl -s -X POST "$BACKSTAGE/api/auth/v1/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=refresh_token&refresh_token=$RT" | jq -r .access_token)

# Call any Backstage API as the user
curl -H "Authorization: Bearer $JWT" "$BACKSTAGE/api/catalog/entities" | jq length
```

The catalog returns its entities as that user — proving the
token authenticates as a user principal end-to-end.

For deeper detail see [docs/spec/user-tokens-verification.md](spec/user-tokens-verification.md).

---

## Troubleshooting

**`401 Unauthorized` on all API calls**

The user token has expired (they are short-lived). Re-run the `curl` command to get a fresh token.

**`403 Forbidden` on all API calls**

The authenticated user is not in `serviceTokens.admin.userEntityRefs`. Add their entity ref to `app-config.yaml` and restart the backend.

**`Cannot find module '@backstage/backend-defaults/auth'`**

The `serviceTokenHandlerModule` uses `createRequire` to resolve Backstage internals from the consuming app's `node_modules`. Ensure the plugin's `node_modules` are resolved through your Backstage app's workspace (i.e., the packages are installed as workspace dependencies, not standalone).

**Migrations not running**

If you see database errors on startup, check that `database.migrations.skip` is not set to `true` for the `service-tokens` plugin in your config.

**User-tokens routes not mounted**

The plugin logs `user-tokens capability not enabled: ...` at boot when prerequisites are missing. Check that both `auth.experimentalDynamicClientRegistration.enabled` and `auth.experimentalRefreshToken.enabled` are `true` in `app-config.yaml` and that `serviceTokens.userTokens.encryptionKey` is a base64 string that decodes to exactly 32 bytes.

**Mint authorization flow doesn't show up / nothing happens after clicking Create**

The plugin uses **same-tab navigation** (not a popup) for the OAuth dance. Clicking Create should change the URL to `/oauth2/authorize/<sessionId>`. If it doesn't, check the browser console for a fetch error from `POST /api/service-tokens/personal/tokens/mint`.

---

## Next steps

- [Configuration Reference](configuration.md) — tune token lifetime, cache TTL, custom scopes, and user-token settings
- [REST API Reference](api.md) — integrate service tokens and user tokens into your CI pipelines and scripts
- [Testing Guide](testing.md) — full end-to-end test walkthrough for both API and UI paths
- [Scope Enforcement Runbook](runbooks/scope-enforcement.md) — optional guide for enforcing token scopes on specific routes
