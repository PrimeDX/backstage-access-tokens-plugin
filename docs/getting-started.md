# Getting Started

This guide walks a platform engineer through installing and wiring the service token plugin into an existing Backstage application. By the end you will have:

- The backend plugin running and serving the REST API at `/api/service-tokens`
- The external auth handler registered so raw service tokens are accepted by Backstage's auth layer
- The frontend admin UI accessible at `/admin/service-tokens`
- A permission policy that controls who can manage tokens
- A working smoke test confirming the full flow

---

## Prerequisites

- A working Backstage app using the **new backend system** (`createBackend`) and the **new frontend system** (`createApp` from `@backstage/frontend-app-api`)
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
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-backend
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-node
yarn --cwd packages/app add @adriandantas/plugin-service-tokens
```

---

## Step 2 — Register the backend plugin

Open your backend entry point and add both the plugin and the auth handler module.

```typescript
// packages/backend/src/index.ts
import { createBackend } from '@backstage/backend-defaults';
import { serviceTokensPlugin } from '@adriandantas/plugin-service-tokens-backend';
import { serviceTokenHandlerModule } from '@adriandantas/plugin-service-tokens-node';

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
import { createApp } from '@backstage/frontend-app-api';
import serviceTokensPlugin from '@adriandantas/plugin-service-tokens';

const app = createApp({
  features: [
    // ... your other plugins ...
    serviceTokensPlugin,
  ],
});

export default app.createRoot();
```

The plugin registers a page at `/admin/service-tokens` using `PageBlueprint`. No additional route configuration is required.

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
} from '@adriandantas/plugin-service-tokens-node';
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

## Troubleshooting

**`401 Unauthorized` on all API calls**

The user token has expired (they are short-lived). Re-run the `curl` command to get a fresh token.

**`403 Forbidden` on all API calls**

The authenticated user is not in `serviceTokens.admin.userEntityRefs`. Add their entity ref to `app-config.yaml` and restart the backend.

**`Cannot find module '@backstage/backend-defaults/auth'`**

The `serviceTokenHandlerModule` uses `createRequire` to resolve Backstage internals from the consuming app's `node_modules`. Ensure the plugin's `node_modules` are resolved through your Backstage app's workspace (i.e., the packages are installed as workspace dependencies, not standalone).

**Migrations not running**

If you see database errors on startup, check that `database.migrations.skip` is not set to `true` for the `service-tokens` plugin in your config.

---

## Next steps

- [Configuration Reference](configuration.md) — tune token lifetime, cache TTL, and custom scopes
- [REST API Reference](api.md) — integrate service tokens into your CI pipelines and scripts
- [Testing Guide](testing.md) — full end-to-end test walkthrough for both API and UI paths
- [Scope Enforcement Runbook](runbooks/scope-enforcement.md) — optional guide for enforcing token scopes on specific routes
