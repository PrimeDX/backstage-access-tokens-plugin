# Install in an Existing Backstage App

Audience: platform engineers wiring the plugin into an existing Backstage app.

Use this guide when your Backstage app already exists and you want the shortest supported path to installation, configuration, and a working smoke test.

This guide walks a platform engineer through installing and wiring the access tokens plugin into an existing Backstage application. By the end you will have:

- The backend plugin running and serving the REST API at `/api/access-tokens/service`
- The external auth handler registered so raw service tokens are accepted by Backstage's auth layer
- The frontend admin UI accessible at `/admin/access-tokens`
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

The plugin enforces three granular permissions (`access-tokens:service:read`, `access-tokens:service:write`, `access-tokens:service:revoke`) on its API endpoints. This requires the Backstage permission framework to be installed in your backend.

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
yarn --cwd packages/backend add @primedx/plugin-access-tokens-backend
yarn --cwd packages/backend add @primedx/plugin-access-tokens-node
yarn --cwd packages/app add @primedx/plugin-access-tokens
```

---

## Step 2 — Register the backend plugin

Open your backend entry point and add both the plugin and the auth handler module.

```typescript
// packages/backend/src/index.ts
import { createBackend } from '@backstage/backend-defaults';
import { accessTokensPlugin } from '@primedx/plugin-access-tokens-backend';
import { serviceAccessTokenHandlerModule } from '@primedx/plugin-access-tokens-node';

const backend = createBackend();

// ... your other plugins ...

backend.add(accessTokensPlugin);
backend.add(serviceAccessTokenHandlerModule);

backend.start();
```

**Why two registrations?**

- `accessTokensPlugin` provides the REST API and manages the token database.
- `serviceAccessTokenHandlerModule` registers the `backstage-service-access-token` external auth handler with Backstage's `core.auth` service. This is what makes raw service tokens accepted as valid credentials on any backend route. It must be registered as a service factory — not a module init hook — because `core.auth` is constructed before module init hooks run.

---

## Step 3 — Register the frontend plugin

```typescript
// packages/app/src/App.tsx
import { createApp } from '@backstage/frontend-defaults';
import accessTokensPlugin from '@primedx/plugin-access-tokens';

const app = createApp({
  features: [
    // ... your other plugins ...
    accessTokensPlugin,
  ],
});

export default app.createRoot();
```

The plugin registers the admin access-tokens page at
`/admin/access-tokens` and, when personal access tokens are enabled, contributes
a `Personal Access Tokens` tab under Backstage user settings at
`/settings/personal-tokens`. No additional route configuration is
required.

---

## Step 4 — Add a permission policy

The plugin exposes three granular permissions:

| Permission | Action | Routes |
|---|---|---|
| `access-tokens:service:read` | List tokens, get token details, view audit logs, list scopes | `GET /`, `GET /:id`, `GET /:id/audit`, `GET /scopes` |
| `access-tokens:service:write` | Create tokens | `POST /` |
| `access-tokens:service:revoke` | Revoke tokens | `DELETE /:id` |

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

For an optional operator-oriented implementation baseline, see the [Scope Enforcement Runbook](enforce-scopes.md).

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
  serviceAccessTokensReadPermission,
  serviceAccessTokensWritePermission,
  serviceAccessTokensRevokePermission,
} from '@primedx/plugin-access-tokens-node';
import { Config } from '@backstage/config';

export class AccessTokensPermissionPolicy implements PermissionPolicy {
  constructor(private readonly config: Config) {}

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const adminRefs =
      this.config.getOptionalStringArray(
        'accessTokens.service.admin.userEntityRefs',
      ) ?? [];

    const isAdmin = adminRefs.includes(user?.info.userEntityRef ?? '');

    // Grant all three service token permissions to admin users
    if (
      isPermission(request.permission, serviceAccessTokensReadPermission) ||
      isPermission(request.permission, serviceAccessTokensWritePermission) ||
      isPermission(request.permission, serviceAccessTokensRevokePermission)
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
> if (isPermission(request.permission, serviceAccessTokensReadPermission)) {
>   return { result: isAuditor ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
> }
> if (
>   isPermission(request.permission, serviceAccessTokensWritePermission) ||
>   isPermission(request.permission, serviceAccessTokensRevokePermission)
> ) {
>   return { result: isAdmin ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
> }
> ```

Register the policy in your backend:

```typescript
// packages/backend/src/index.ts
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import { AccessTokensPermissionPolicy } from './serviceTokensPermissionPolicy';

const permissionModuleServiceTokens = createBackendModule({
  pluginId: 'permission',
  moduleId: 'access-tokens-policy',
  register(reg) {
    reg.registerInit({
      deps: {
        policy: policyExtensionPoint,
        config: coreServices.rootConfig,
      },
      async init({ policy, config }) {
        policy.setPolicy(new AccessTokensPermissionPolicy(config));
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
accessTokens:
  service:
    admin:
      userEntityRefs:
        - user:default/alice   # replace with your admin user entity refs
```

This grants the service token permissions to the listed users. Users not in this list will receive `403 Forbidden` when accessing any service token endpoint.

For all available configuration options, see the [Configuration Reference](../reference/configuration.md).

---

## Step 6 — Configure the database (optional)

By default, the plugin uses whatever database your Backstage backend is configured to use. The plugin runs its own migrations automatically on startup — no manual schema setup is required.

For development with SQLite, you may want a dedicated database file to avoid conflicts with the in-memory default:

```yaml
# app-config.local.yaml (dev only — do not commit)
backend:
  database:
    plugin:
      access-tokens:
        connection: '/tmp/access-tokens.sqlite'
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
curl -s http://localhost:7007/api/access-tokens/service/scopes \
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
curl -s -X POST http://localhost:7007/api/access-tokens/service \
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

Open `http://localhost:3000/admin/access-tokens` in your browser. The token you just created should appear in the table.

---

## Step 8 — (Optional) Enable personal access tokens

The plugin family also offers **user-self-service personal access
tokens** as a separate capability. Service tokens (covered above) are
admin-managed and authenticate as a group; personal access tokens are minted by
each user from `Settings` → `Personal Access Tokens`
(`/settings/personal-tokens`). A personal access token is a
user-managed Backstage refresh token. Integrations exchange it for a
short-lived Backstage API JWT, and that JWT authenticates as the user
principal against every Backstage backend plugin.

Personal access tokens are opt-in. Service-token behavior is unchanged whether
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
personal-access-token routes log a warning at boot and stay unmounted.

### 8.2 Generate an encryption key

```bash
openssl rand -base64 32
```

Paste the value into `app-config.yaml`:

```yaml
accessTokens:
  personal:
    encryptionKey: '<base64 of 32 random bytes>'
```

The plugin uses this key to encrypt refresh tokens at rest in the
plugin DB (AES-256-GCM). The key is needed at revocation time to
call `/v1/revoke` with the decrypted token. Losing the key
permanently breaks UI revocation for in-flight tokens; rotate
carefully (see [Production Readiness](production.md)).

### 8.3 Wire the auth-consent plugin into the frontend

The OAuth consent route at `/oauth2/authorize/:sessionId` is
provided by `personalAccessTokensAuthPlugin`, a named export from the
frontend package. Add it alongside the main access-tokens frontend
feature:

```ts
// packages/app/src/App.tsx
import accessTokensPlugin, {
  personalAccessTokensAuthPlugin,
} from '@primedx/plugin-access-tokens';

export default createApp({
  features: [personalAccessTokensAuthPlugin, /* …, */ accessTokensPlugin],
});
```

Without this, the mint flow's same-tab redirect to
`/oauth2/authorize/:sessionId` hits a 404.

Do not register both `personalAccessTokensAuthPlugin` and Backstage's stock
auth-consent frontend for `/oauth2` unless your app intentionally
handles the route conflict another way.

### 8.4 Permit the personal-access-token permissions

If your `PermissionPolicy` has explicit handling for access-tokens
permissions, add a parallel block for user-tokens. The spec's
"default-open" rule is: every authenticated user can mint, list,
and revoke their own tokens.

```ts
import {
  personalAccessTokensReadPermission,
  personalAccessTokensWritePermission,
  personalAccessTokensRevokePermission,
} from '@primedx/plugin-access-tokens-node';

// inside your PermissionPolicy.handle:
if (
  isPermission(request.permission, personalAccessTokensReadPermission) ||
  isPermission(request.permission, personalAccessTokensWritePermission) ||
  isPermission(request.permission, personalAccessTokensRevokePermission)
) {
  return { result: AuthorizeResult.ALLOW };
}
```

### 8.5 Smoke-check personal access tokens

After restarting the backend you should see this log line at boot:

```
access-tokens info personal-access-token capability enabled at /api/access-tokens/personal
```

Then in the browser:

1. Sign in to Backstage.
2. Navigate to `Settings` → `Personal Access Tokens`
   (`/settings/personal-tokens`).
3. Click **Create token**, enter a name, click Create.
4. The page navigates to a Backstage consent screen (same tab).
   Click Authorize.
5. The page returns to `/settings/personal-tokens` and a dialog
   automatically opens with the raw Backstage refresh token. Copy it.

Use the token from any integration or client that can make HTTP
requests. Do not send the personal access token directly as
`Authorization: Bearer <token>` to normal Backstage APIs. Exchange it
for a short-lived Backstage API token first:

```bash
ACCESS_TOKEN=$(curl -s -X POST "$BACKSTAGE/api/auth/v1/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=refresh_token' \
  --data-urlencode "refresh_token=$RT" \
  | jq -r .access_token)

# Call any Backstage API as the user
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BACKSTAGE/api/catalog/entities" | jq length
```

The catalog returns its entities as that user — proving the
returned API token authenticates as a user principal end-to-end.

For deeper detail see [docs/spec/user-tokens-verification.md](../spec/user-tokens-verification.md).

---

## Troubleshooting

**`401 Unauthorized` on all API calls**

The user token has expired (they are short-lived). Re-run the `curl` command to get a fresh token.

**`403 Forbidden` on all API calls**

The authenticated user is not in `accessTokens.service.admin.userEntityRefs`. Add their entity ref to `app-config.yaml` and restart the backend.

**`Cannot find module '@backstage/backend-defaults/auth'`**

The `serviceAccessTokenHandlerModule` uses `createRequire` to resolve Backstage internals from the consuming app's `node_modules`. Ensure the plugin's `node_modules` are resolved through your Backstage app's workspace (i.e., the packages are installed as workspace dependencies, not standalone).

**Migrations not running**

If you see database errors on startup, check that `database.migrations.skip` is not set to `true` for the `access-tokens` plugin in your config.

**User-tokens routes not mounted**

The plugin logs `personal-access-token capability not enabled: ...` at boot when prerequisites are missing. Check that both `auth.experimentalDynamicClientRegistration.enabled` and `auth.experimentalRefreshToken.enabled` are `true` in `app-config.yaml` and that `accessTokens.personal.encryptionKey` is a base64 string that decodes to exactly 32 bytes.

**Mint authorization flow doesn't show up / nothing happens after clicking Create**

The plugin uses **same-tab navigation** (not a popup) for the OAuth dance. Clicking Create should change the URL to `/oauth2/authorize/<sessionId>`. If it doesn't, check the browser console for a fetch error from `POST /api/access-tokens/personal/mint`.

---

## Next steps

- [Configuration Reference](../reference/configuration.md) — tune token lifetime, cache TTL, custom scopes, and user-token settings
- [REST API Reference](../reference/rest-api.md) — integrate service tokens and personal access tokens into external clients and automation
- [Testing Guide](test.md) — full end-to-end test walkthrough for both API and UI paths
- [Scope Enforcement Runbook](enforce-scopes.md) — optional guide for enforcing token scopes on specific routes
