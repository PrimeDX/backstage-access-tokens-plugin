# Build a Backstage App with Service Token Support — End-to-End Tutorial

Audience: evaluators and adopters starting from a fresh Backstage app.

Use this guide when you want to experience the full setup journey from scaffolding a new app through validating the plugin in both API and UI flows.

> **Estimated time:** ~30 minutes  
> **Difficulty:** Beginner-friendly — no prior Backstage experience required

By the end of this tutorial you will have:

- A **Backstage developer portal** running locally, scaffolded from scratch
- The **service token plugin** installed and wired into both the backend and frontend
- An **admin UI** at `/admin/service-tokens` where you can create and manage tokens
- A **machine-readable service token** that authenticates against the Backstage Catalog API
- **Proof it all works** — via both `curl` and the browser

This is the full journey: scaffold → install → configure → test. Let's build it.

---

## Before you start

Make sure the following tools are available on your machine:

| Tool | Minimum version | Check |
|---|---|---|
| Node.js | 22 | `node --version` |
| Yarn | 1.22+ (classic) or 4+ | `yarn --version` |
| jq | any | `jq --version` |
| curl | any | `curl --version` |

> **Node version manager:** If you use `nvm`, run `nvm use 22` (or `nvm install 22`) before starting. The Backstage CLI requires Node 22.

> **Auth setup:** This tutorial uses Backstage's built-in **guest auth provider**, which is enabled by default in development. You do not need to configure GitHub, Google, or any other OAuth provider to follow along.

---

## Part 1 — Scaffold a new Backstage app

*~5 minutes*

Backstage ships a CLI that scaffolds a complete monorepo for you. Run:

```bash
npx @backstage/create-app@latest
```

The CLI will ask for an app name. Enter something like `my-portal`:

```
? Enter a name for the app [required] my-portal
```

The scaffolder creates a `my-portal/` directory, installs dependencies, and prints a success message. Move into the new directory:

```bash
cd my-portal
```

Start the app in development mode:

```bash
yarn start
```

This starts both the backend (port 7007) and the frontend (port 3000) in a single terminal. Wait until you see both of these lines:

```
[0] Backend listening on :7007
[1] Rspack compiled successfully
```

> **Tip:** `yarn start` runs both processes together. If you prefer separate terminals, use `yarn workspace backend start` and `yarn workspace app start` in two separate shells.

### ✅ Checkpoint 1

Open `http://localhost:3000` in your browser. You should see the Backstage home page with a "Sign in" button. Click **Enter** (guest sign-in) to confirm the app is working.

Stop the dev server (`Ctrl+C`) before continuing.

---

## Part 2 — Install the plugin packages

*~2 minutes*

The service token plugin ships as three npm packages:

| Package | Role |
|---|---|
| `@primedx/plugin-service-tokens-backend` | REST API, database, permission enforcement |
| `@primedx/plugin-service-tokens-node` | Shared auth handler — makes raw tokens accepted by Backstage |
| `@primedx/plugin-service-tokens` | Frontend admin UI |

Install them into the correct workspaces:

```bash
yarn --cwd packages/backend add @primedx/plugin-service-tokens-backend
yarn --cwd packages/backend add @primedx/plugin-service-tokens-node
yarn --cwd packages/app add @primedx/plugin-service-tokens
```

### ✅ Checkpoint 2

Run `yarn install` to make sure the workspace is consistent:

```bash
yarn install
```

You should see no errors. If you see peer dependency warnings, they are safe to ignore for this tutorial.

---

## Part 3 — Wire the backend

*~5 minutes*

Open `packages/backend/src/index.ts`. You will see a file that already includes `plugin-permission-backend` and `plugin-permission-backend-module-allow-all-policy` from the scaffold.

Add the service token plugin and auth handler module imports at the top, then register them **after** the existing permission lines:

```typescript
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-catalog-backend'));
// ... your other plugins ...

// permission plugin — already present in the scaffold, DO NOT add it again
backend.add(import('@backstage/plugin-permission-backend'));
// NOTE: keep the allow-all policy for now; we will replace it in Part 5
backend.add(import('@backstage/plugin-permission-backend-module-allow-all-policy'));

// Service token plugin — REST API and token database
backend.add(import('@primedx/plugin-service-tokens-backend'));

// Auth handler — makes raw service tokens accepted by Backstage's auth layer
backend.add(import('@primedx/plugin-service-tokens-node'));

backend.start();
```

**Why two registrations?**

- `serviceTokensPlugin` provides the REST API at `/api/service-tokens` and manages the token database.
- `serviceTokenHandlerModule` registers the `backstage-service-token` external auth handler with Backstage's `core.auth` service. This is what makes raw service tokens accepted as valid credentials on *any* backend route — not just the service token API.

> ⚠️ **Do not add `plugin-permission-backend` a second time.** A fresh Backstage scaffold already includes it. Adding it twice causes a startup crash: *"ExtensionPoint with ID 'permission.policy' is already registered"*.

### ✅ Checkpoint 3

Start only the backend to confirm it compiles and starts without errors:

```bash
yarn workspace backend start
```

You should see `Backend listening on :7007` with no import errors. Stop it (`Ctrl+C`) before continuing.

---

## Part 4 — Wire the frontend

*~2 minutes*

Open `packages/app/src/App.tsx` and add the service token plugin to the `features` array:

```typescript
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

The plugin registers a page at `/admin/service-tokens` using Backstage's `PageBlueprint`. No additional route configuration is needed.

### ✅ Checkpoint 4

Start only the frontend to confirm it compiles:

```bash
yarn workspace app start
```

You should see `Rspack compiled successfully` with no console errors. Stop it before continuing.

---

## Part 5 — Add a permission policy

*~5 minutes*

The plugin enforces three granular permissions on its API endpoints:

| Permission | What it gates |
|---|---|
| `service-tokens:read` | List tokens, get details, view audit logs, list scopes |
| `service-tokens:write` | Create tokens |
| `service-tokens:revoke` | Revoke tokens |

> ⚠️ **If you already have a permission policy** in your app, do not create a new one — Backstage supports only one active policy at a time. Instead, add the service token permission checks to your existing `handle` method and skip to the "Register the policy" step below.

**Create the policy file:**

Create a new file at `packages/backend/src/serviceTokensPermissionPolicy.ts`:

```typescript
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
import { Config } from '@backstage/config';

export class ServiceTokensPermissionPolicy implements PermissionPolicy {
  constructor(private readonly config: Config) {}

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const {
      serviceTokensReadPermission,
      serviceTokensWritePermission,
      serviceTokensRevokePermission,
    } = await import('@primedx/plugin-service-tokens-node');

    const adminRefs =
      this.config.getOptionalStringArray(
        'serviceTokens.admin.userEntityRefs',
      ) ?? [];

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
```

**Register the policy in your backend:**

Back in `packages/backend/src/index.ts`, make **two changes together**:

1. **Remove** the allow-all policy line (it conflicts with your custom policy).
2. **Add** the custom policy module in its place.

> ⚠️ **Critical — both changes must happen at the same time:**
> - Removing the allow-all policy without adding a replacement causes: *"No policy module installed!"*
> - Adding a custom policy without removing the allow-all causes: *"ExtensionPoint with ID 'permission.policy' is already registered"*
> - Backstage only allows **one** policy module registered at a time.

Your updated `index.ts` should look like this:

```typescript
import { createBackend } from '@backstage/backend-defaults';
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import { ServiceTokensPermissionPolicy } from './serviceTokensPermissionPolicy';

const backend = createBackend();

// ... your other plugins ...

// permission plugin
backend.add(import('@backstage/plugin-permission-backend'));
// NOTE: the allow-all line has been REMOVED and replaced by permissionModuleServiceTokens below

backend.add(import('@primedx/plugin-service-tokens-backend'));
backend.add(import('@primedx/plugin-service-tokens-node'));

// Permission policy — grants service token permissions to users listed in config
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

backend.start();
```

---

## Part 6 — Configure the app

*~2 minutes*

**Add the service token handler and admin users to `app-config.yaml`:**

```yaml
backend:
  auth:
    externalAccess:
      - type: backstage-service-token
        options: {}

serviceTokens:
  admin:
    userEntityRefs:
      - user:development/guest   # the default dev user — replace in production
```

> **Why `backend.auth.externalAccess`?** Backstage's auth layer only invokes external token handlers that are listed in this config. The `backstage-service-token` entry tells Backstage to route unrecognised tokens through the service token plugin's verifier. Without it, raw tokens are rejected with `Illegal token` even though the plugin is installed.

> ⚠️ **Production note:** Replace `user:development/guest` with the entity refs of your actual admin users (e.g. `user:default/alice`) in production.

**Create `app-config.local.yaml`** with a dedicated SQLite file for the plugin:

```yaml
backend:
  database:
    plugin:
      service-tokens:
        connection: 'packages/backend/tmp/service-tokens.sqlite'

serviceTokens:
  cacheTtlSeconds: 0
```

> **Note:** `app-config.local.yaml` is gitignored by default. It is the right place for dev-only overrides. Backstage resolves relative SQLite paths from the project root, and `packages/backend/tmp/` is the conventional location.
>
> Setting `cacheTtlSeconds: 0` makes the revocation step deterministic for this tutorial. In production, keep the default or tune it intentionally.

---

## Part 7 — Add a tutorial group to the catalog

*~3 minutes*

The plugin validates `groupEntityRef` against real `Group` entities in the Backstage catalog. Open `examples/org.yaml` and add:

```yaml
---
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  name: platform
spec:
  type: team
  profile:
    displayName: Platform
  children: []
```

This gives us a stable group ref: `group:default/platform`

Confirm that `app-config.yaml` includes `org.yaml` in `catalog.locations`. In a fresh app it is already there:

```yaml
catalog:
  locations:
    - type: file
      target: ../../examples/org.yaml
      rules:
        - allow: [User, Group]
```

> **Why this matters:** If `org.yaml` is not listed, the backend will not ingest the `Group`, and token creation will fail with `groupEntityRef must reference an existing Group entity`.

---

## Part 8 — Start the app

```bash
yarn start
```

Wait for both lines:

```
[0] Backend listening on :7007
[1] Rspack compiled successfully
```

### ✅ Checkpoint 5

Open `http://localhost:3000/admin/service-tokens`. The page should load with a "Service Tokens" header, filter bar, and **Create token** button. No 401 or 403 error.

---

## Part 9 — Verify the tutorial group exists

First get a guest token (same step as Part 10 Step A1):

```bash
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' \
  | jq -r '.backstageIdentity.token')
```

Then query the catalog:

```bash
curl -s "http://localhost:7007/api/catalog/entities?filter=kind=group" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.[] | {name: .metadata.name, namespace: (.metadata.namespace // "default"), ref: ("group:" + (.metadata.namespace // "default") + "/" + .metadata.name)}'
```

**Expected output includes:**

```json
{
  "name": "platform",
  "namespace": "default",
  "ref": "group:default/platform"
}
```

---

## Part 10 — Test via the API

### Step A1 — Get a guest token

```bash
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' \
  | jq -r '.backstageIdentity.token')
echo "TOKEN=$TOKEN"
```

> ⚠️ Tokens are short-lived. Re-run this command if you get 401 on later steps.

### Step A2 — List available scopes

```bash
curl -s http://localhost:7007/api/service-tokens/scopes \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Step A3 — Create a service token

```bash
RESPONSE=$(curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "tutorial-token",
    "description": "Created during the tutorial",
    "groupEntityRef": "group:default/platform",
    "scopes": ["catalog:read"],
    "expiresInDays": 30
  }')

echo "$RESPONSE" | jq .

TOKEN_ID=$(echo "$RESPONSE" | jq -r '.token.id')
RAW_TOKEN=$(echo "$RESPONSE" | jq -r '.rawToken')
```

> ⚠️ `rawToken` is shown exactly once. Copy it now.

### Step A4 — Use the raw token against the Catalog API

```bash
curl -s "http://localhost:7007/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer $RAW_TOKEN" | jq .
```

**Expected:** HTTP 200 with catalog entities.

### Step A5 — Inspect the audit log

```bash
curl -s http://localhost:7007/api/service-tokens/$TOKEN_ID/audit \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Step A6 — Revoke the token

```bash
curl -s -X DELETE http://localhost:7007/api/service-tokens/$TOKEN_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "tutorial revocation test"}' \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** `HTTP status: 204`

### Step A7 — Confirm the raw token is rejected

```bash
curl -s "http://localhost:7007/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer $RAW_TOKEN" \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** `HTTP status: 401` immediately in this tutorial, because Part 6 sets `serviceTokens.cacheTtlSeconds: 0`.

### Step A8 — Test permission enforcement

**Unauthenticated (should get 401):**

```bash
curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Content-Type: application/json" \
  -d '{"name":"should-fail","groupEntityRef":"group:default/platform","scopes":["catalog:read"]}' \
  -w "\nHTTP status: %{http_code}\n"
```

**Non-admin user (should get 403):** Temporarily set `userEntityRefs: []` in `app-config.yaml`, restart, get a fresh token, and retry the create call. Expected: `HTTP status: 403`. Restore the config before continuing.

### ✅ Checkpoint 6

- ✅ Backend running and plugin registered
- ✅ Guest user has admin permission
- ✅ Token creation returns a raw token
- ✅ Raw token authenticates against Catalog API
- ✅ Revocation works — token rejected after revoke
- ✅ Unauthenticated → 401; non-admin → 403

---

## Part 11 — Test via the UI

Make sure `yarn start` is running.

### Step B1 — Navigate to the page

Open `http://localhost:3000/admin/service-tokens`. Expected: "Service Tokens" header, filter bar, **Create token** button, empty table.

### Step B2 — Create a token

1. Click **Create token**
2. Fill in: Name `ui-tutorial-token`, Group `group:default/platform`, Permission `catalog:read`
3. Click **Create token**
4. Copy the raw token shown in the success dialog
5. Click **Done** — table shows one active row

### Step B3 — Filter the list

Test the Status and Group filters, then click Clear.

### Step B4 — View the audit log

Click **Audit** on the row. Expected: one `created` event.

### Step B5 — Revoke the token

Click **Revoke**, enter reason `tutorial revocation via UI`, confirm. Expected: row shows **Revoked** status.

### Step B6 — Confirm the raw token is rejected

```bash
curl -s "http://localhost:7007/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer <raw-token-from-B2>" \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** `HTTP status: 401` immediately in this tutorial, because Part 6 sets `serviceTokens.cacheTtlSeconds: 0`.

### Step B7 — Confirm revocation in the audit log

Click **Audit** again. Expected: two rows in newest-first order — `revoked` with the reason, then `created`.

### ✅ Checkpoint 7 — Tutorial complete

---

## Cleanup

```bash
rm packages/backend/tmp/service-tokens.sqlite
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 Unauthorized` on all API calls | Guest token expired | Re-run the `guest/refresh` curl command |
| `403 Forbidden` on all API calls | User not in `serviceTokens.admin.userEntityRefs` | Add `user:development/guest` to `app-config.yaml` and restart |
| `groupEntityRef must reference an existing Group entity` | Tutorial group not in catalog | Complete Part 7, verify `catalog.locations`, restart backend |
| Catalog group query returns `[]` | No `Group` entities loaded | Add `platform` group to `examples/org.yaml`, restart backend |
| Raw token still works after revocation | Token is cached | For this tutorial, confirm `serviceTokens.cacheTtlSeconds: 0` is present in `app-config.local.yaml`; otherwise wait up to the configured TTL |
| `ExtensionPoint with ID 'permission.policy' is already registered` | Two policy modules registered at once | Remove `plugin-permission-backend-module-allow-all-policy` from `index.ts` |
| `No policy module installed!` | Allow-all was removed but no replacement added | Add `permissionModuleServiceTokens` to `index.ts` (Part 5) |
| Frontend shows 403 on page load | Permission policy not registered | Confirm `permissionModuleServiceTokens` is in `index.ts` and backend was restarted |
| `Cannot find module` errors | Plugin not installed in workspace | Run `yarn --cwd packages/backend add @primedx/...` |
| Migrations not running | `database.migrations.skip: true` in config | Remove that config key for the `service-tokens` plugin |

---

## What's next

- **[Configuration Reference](configuration.md)** — tune token lifetime, cache TTL, and add custom scopes
- **[REST API Reference](api.md)** — integrate service tokens into CI pipelines
- **[Production Readiness Guide](production-readiness.md)** — group-based admin access, policy merging, audit log retention
- **[Architecture](architecture.md)** — understand how token verification works under the hood
- **[Scope Enforcement Runbook](runbooks/scope-enforcement.md)** — enforce token scopes on specific routes in your own plugins
