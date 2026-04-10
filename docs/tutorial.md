# Build a Backstage App with Service Token Support — End-to-End Tutorial

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
yarn dev
```

This starts both the backend (port 7007) and the frontend (port 3000) in a single terminal. Wait until you see both of these lines:

```
[0] Backend listening on :7007
[1] Rspack compiled successfully
```

> **Tip:** `yarn dev` runs both processes together. If you prefer separate terminals, use `yarn workspace backend start` and `yarn workspace app start` in two separate shells.

### ✅ Checkpoint 1

Open `http://localhost:3000` in your browser. You should see the Backstage home page with a "Sign in" button. Click **Enter** (guest sign-in) to confirm the app is working.

Stop the dev server (`Ctrl+C`) before continuing.

---

## Part 2 — Install the plugin packages

*~2 minutes*

The service token plugin ships as three npm packages:

| Package | Role |
|---|---|
| `@adriandantas/plugin-service-tokens-backend` | REST API, database, permission enforcement |
| `@adriandantas/plugin-service-tokens-node` | Shared auth handler — makes raw tokens accepted by Backstage |
| `@adriandantas/plugin-service-tokens` | Frontend admin UI |

Install them into the correct workspaces:

```bash
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-backend
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-node
yarn --cwd packages/app add @adriandantas/plugin-service-tokens
```

Also install the Backstage permission backend (required for the permission policy in Part 5):

```bash
yarn --cwd packages/backend add @backstage/plugin-permission-backend
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

Open `packages/backend/src/index.ts`. You'll see a file that looks like this:

```typescript
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-catalog-backend'));
// ... other plugins ...

backend.start();
```

Add the service token plugin, the auth handler module, and the permission backend:

```typescript
import { createBackend } from '@backstage/backend-defaults';
import { serviceTokensPlugin } from '@adriandantas/plugin-service-tokens-backend';
import { serviceTokenHandlerModule } from '@adriandantas/plugin-service-tokens-node';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-catalog-backend'));
// ... your other plugins ...

// Service token plugin — REST API and token database
backend.add(serviceTokensPlugin);

// Auth handler — makes raw service tokens accepted by Backstage's auth layer
backend.add(serviceTokenHandlerModule);

// Permission backend — required for the permission policy
backend.add(import('@backstage/plugin-permission-backend'));

backend.start();
```

**Why two registrations?**

- `serviceTokensPlugin` provides the REST API at `/api/service-tokens` and manages the token database.
- `serviceTokenHandlerModule` registers the `backstage-service-token` external auth handler with Backstage's `core.auth` service. This is what makes raw service tokens accepted as valid credentials on *any* backend route — not just the service token API. It must be registered as a service factory (not a module init hook) because `core.auth` is constructed before module init hooks run.

### ✅ Checkpoint 3

Start only the backend to confirm it compiles and starts without errors:

```bash
yarn workspace backend start
```

You should see `Backend listening on :7007` with no import errors. Stop it (`Ctrl+C`) before continuing.

---

## Part 4 — Wire the frontend

*~2 minutes*

Open `packages/app/src/App.tsx`. Find the `createApp` call and add the service token plugin to the `features` array:

```typescript
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

All three are `ResourcePermission<'service-token'>`, making them compatible with Backstage RBAC plugins.

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

**Register the policy in your backend:**

Back in `packages/backend/src/index.ts`, add the policy module:

```typescript
import { createBackend } from '@backstage/backend-defaults';
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import { serviceTokensPlugin } from '@adriandantas/plugin-service-tokens-backend';
import { serviceTokenHandlerModule } from '@adriandantas/plugin-service-tokens-node';
import { ServiceTokensPermissionPolicy } from './serviceTokensPermissionPolicy';

const backend = createBackend();

// ... your other plugins ...

backend.add(serviceTokensPlugin);
backend.add(serviceTokenHandlerModule);
backend.add(import('@backstage/plugin-permission-backend'));

// Permission policy — grants all three service token permissions to users in config
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

**Add admin users to `app-config.yaml`:**

Open `app-config.yaml` (in the root of your Backstage app) and add the `serviceTokens` section:

```yaml
serviceTokens:
  admin:
    userEntityRefs:
      - user:development/guest   # the default dev user — replace in production
```

> ⚠️ **Not sure what your entity ref is?** When you sign in as guest in development, your entity ref is `user:development/guest`. This is the default and is what we'll use throughout this tutorial.

> ⚠️ **Production note:** The `user:development/guest` default is intentionally permissive for local development. In production, replace this with the entity refs of your actual admin users (e.g. `user:default/alice`).

**Add a dev database override to `app-config.local.yaml`:**

Create (or open) `app-config.local.yaml` and add a dedicated SQLite file for the plugin. This keeps the service token data separate from the rest of the app's in-memory database:

```yaml
backend:
  database:
    plugin:
      service-tokens:
        connection: '/tmp/service-tokens.sqlite'
```

> **Note:** `app-config.local.yaml` is gitignored by default. It's the right place for dev-only overrides.

---

## Part 7 — Start the app

*~1 minute*

Start both the backend and frontend:

```bash
yarn dev
```

Wait for both of these lines to appear:

```
[0] Backend listening on :7007
[1] Rspack compiled successfully
```

### ✅ Checkpoint 5

Open `http://localhost:3000/admin/service-tokens` in your browser.

**Expected:** The page loads with a "Service Tokens" header, a filter bar, a **Create token** button, and an empty table. No 401 or 403 error is shown.

If you see a 403 error, double-check that `user:development/guest` is in `serviceTokens.admin.userEntityRefs` in `app-config.yaml` and restart the backend.

---

## Part 8 — Test via the API

*~10 minutes*

Now let's prove the whole system works end-to-end with `curl`. Each step shows the command, the expected output, and what it proves.

### Step A1 — Get a guest token

The guest auth provider issues a short-lived Backstage identity token. Capture it:

```bash
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' \
  | jq -r '.backstageIdentity.token')

echo "TOKEN=$TOKEN"
```

Verify it decodes to the guest identity:

```bash
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

**Expected:** `"sub": "user:development/guest"` in the decoded payload.

> ⚠️ **Tokens are short-lived.** If you get a 401 response on a later step, re-run this command to get a fresh token.

---

### Step A2 — List available scopes

```bash
curl -s http://localhost:7007/api/service-tokens/scopes \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:**

```json
{
  "scopes": [
    { "id": "catalog:read",       "description": "Read access to the Software Catalog API",       "plugin": "catalog" },
    { "id": "catalog:write",      "description": "Write access to the Software Catalog API",      "plugin": "catalog" },
    { "id": "techdocs:read",      "description": "Read access to TechDocs",                       "plugin": "techdocs" },
    { "id": "scaffolder:read",    "description": "Read access to Scaffolder templates and tasks", "plugin": "scaffolder" },
    { "id": "scaffolder:execute", "description": "Execute Scaffolder templates",                  "plugin": "scaffolder" }
  ]
}
```

**What this proves:** The backend is running, the plugin is registered, and the guest user has the permissions needed for the read path.

---

### Step A3 — Create a service token

```bash
RESPONSE=$(curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "tutorial-token",
    "description": "Created during the tutorial",
    "groupEntityRef": "group:default/guests",
    "scopes": ["catalog:read"],
    "expiresInDays": 30
  }')

echo "$RESPONSE" | jq .
```

**Expected:**

```json
{
  "token": {
    "id": "<uuid>",
    "name": "tutorial-token",
    "description": "Created during the tutorial",
    "groupEntityRef": "group:default/guests",
    "scopes": ["catalog:read"],
    "createdBy": "user:development/guest",
    "createdAt": "<timestamp>",
    "expiresAt": "<timestamp>",
    "status": "active"
  },
  "rawToken": "<opaque-token-string>"
}
```

> ⚠️ **The `rawToken` is shown exactly once.** It is never stored — only its SHA-256 hash is persisted. Copy it now. You will need it in the next step.

Capture the token ID and raw token for subsequent steps:

```bash
TOKEN_ID=$(echo "$RESPONSE" | jq -r '.token.id')
RAW_TOKEN=$(echo "$RESPONSE" | jq -r '.rawToken')

echo "TOKEN_ID=$TOKEN_ID"
echo "RAW_TOKEN=$RAW_TOKEN"
```

---

### Step A4 — Use the raw token against the Catalog API

This is the key moment: a machine credential authenticating against Backstage.

```bash
curl -s "http://localhost:7007/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer $RAW_TOKEN" | jq .
```

**Expected:** HTTP 200 with a JSON array containing at least one catalog entity.

**What this proves:** The `serviceTokenHandlerModule` is correctly registered. Backstage's `core.auth` service accepted the raw token, resolved it to a service principal (`service-token:group:default/guests:tutorial-token`), and the Catalog API served the request.

---

### Step A5 — Inspect the audit log

```bash
curl -s http://localhost:7007/api/service-tokens/$TOKEN_ID/audit \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:**

```json
{
  "events": [
    {
      "id": "<uuid>",
      "tokenId": "<TOKEN_ID>",
      "action": "created",
      "performedBy": "user:development/guest",
      "occurredAt": "<timestamp>",
      "reason": null
    }
  ]
}
```

---

### Step A6 — Revoke the token

```bash
curl -s -X DELETE http://localhost:7007/api/service-tokens/$TOKEN_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "tutorial revocation test"}' \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** `HTTP status: 204`

---

### Step A7 — Confirm the raw token is rejected

```bash
curl -s "http://localhost:7007/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer $RAW_TOKEN" \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** `HTTP status: 401`

**What this proves:** Revocation works. The token is no longer accepted by the auth layer.

> **Cache note:** Revocation takes effect within `cacheTtlSeconds` (default: 60 seconds). If you get a 200 immediately after revoking, wait a moment and try again.

Also confirm the audit log now has two events:

```bash
curl -s http://localhost:7007/api/service-tokens/$TOKEN_ID/audit \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:** Two events — `created` and `revoked` — with the reason `"tutorial revocation test"`.

---

### Step A8 — Test permission enforcement

**Unauthenticated request (should get 401):**

```bash
curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Content-Type: application/json" \
  -d '{"name":"should-fail","groupEntityRef":"group:default/guests","scopes":["catalog:read"]}' \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** `HTTP status: 401`

**Non-admin user (should get 403):**

Temporarily remove `user:development/guest` from `app-config.yaml`:

```yaml
serviceTokens:
  admin:
    userEntityRefs: []   # empty — no admins
```

Restart the backend, get a fresh token, then try to create a token:

```bash
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' | jq -r '.backstageIdentity.token')

curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"should-fail","groupEntityRef":"group:default/guests","scopes":["catalog:read"]}' \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** `HTTP status: 403` with body `{"error":"Forbidden: admin access required"}`.

Restore the original config and restart the backend before continuing.

---

### ✅ Checkpoint 6

You've confirmed:
- ✅ Backend is running and the plugin is registered
- ✅ Guest user has admin permission
- ✅ Token creation works and returns a raw token
- ✅ Raw token authenticates against the Catalog API
- ✅ Revocation works and the token is rejected after revocation
- ✅ Unauthenticated requests get 401, non-admin requests get 403

---

## Part 9 — Test via the UI

*~5 minutes*

Now do the same lifecycle through the browser. Make sure both the backend and frontend are running (`yarn dev`).

### Step B1 — Navigate to the page

Open `http://localhost:3000/admin/service-tokens`.

**Expected:**
- The page loads with the **"Service Tokens"** header.
- A filter bar (Status dropdown + Group field) and a **Create token** button are visible.
- The table shows an empty state: *"No service tokens yet"*.

---

### Step B2 — Create a token

1. Click **Create token**.
2. The **Create service token** dialog opens.
3. Fill in the form:
   - **Name:** `ui-tutorial-token`
   - **Description:** `Created via UI during the tutorial`
   - **Owning group:** select `group:default/guests`
   - **Permissions:** check `catalog:read`
   - **Expiry date:** leave the default (30 days)
4. Click **Create token**.

**Expected on success:** The dialog switches to a success step showing a green checkmark and the raw token in a monospace box with a copy icon.

5. **Click the copy icon** to copy the raw token. You'll need it in Step B6.
6. Click **Done**.

**Expected after closing:** The table now shows one row for `ui-tutorial-token` with status **Active**.

---

### Step B3 — Filter the list

1. In the **Status** dropdown, select `Active`.
   - **Expected:** `ui-tutorial-token` remains visible.
2. In the **Group** field, type `group:default/guests`.
   - **Expected:** `ui-tutorial-token` still appears.
3. Click **Clear** to reset both filters.

---

### Step B4 — View the audit log

1. Click the **Audit** button on the `ui-tutorial-token` row.
2. The **Audit log** dialog opens.

**Expected:** One row with event chip **created**, actor `user:development/guest`, and no reason.

3. Click **Close**.

---

### Step B5 — Revoke the token

1. Click the **Revoke** button on the `ui-tutorial-token` row.
2. The **Revoke token?** dialog opens.
3. Enter reason: `tutorial revocation via UI`
4. Click **Revoke**.

**Expected after closing:** The `ui-tutorial-token` row now shows a **Revoked** status chip. The Revoke button is disabled.

---

### Step B6 — Confirm the raw token is rejected

Use the raw token you copied in Step B2:

```bash
curl -s "http://localhost:7007/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer <raw-token-from-B2>" \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** `HTTP status: 401`

---

### Step B7 — Confirm revocation in the audit log

1. Click **Audit** on the `ui-tutorial-token` row.

**Expected:** Two rows:
1. **created** — `user:development/guest` — no reason
2. **revoked** (red chip) — `user:development/guest` — reason: `tutorial revocation via UI`

---

### ✅ Checkpoint 7 — Tutorial complete

You've built a Backstage app from scratch, installed and configured the service token plugin, and verified the full token lifecycle through both the API and the browser UI.

---

## Cleanup

To reset all token state, remove the SQLite database file:

```bash
rm /tmp/service-tokens.sqlite
```

The file is recreated with fresh migrations on the next backend start.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 Unauthorized` on all API calls | Guest token expired (they are short-lived) | Re-run the `curl -X POST .../guest/refresh` command |
| `403 Forbidden` on all API calls | User not in `serviceTokens.admin.userEntityRefs` | Add `user:development/guest` to `app-config.yaml` and restart the backend |
| Raw token still works after revocation | Token is cached (up to `cacheTtlSeconds` seconds) | Wait 60 seconds and try again, or set `cacheTtlSeconds: 0` in config |
| `Cannot find module '@backstage/backend-defaults/auth'` | Plugin not resolved from app's `node_modules` | Ensure packages are installed as workspace dependencies (`yarn --cwd packages/backend add ...`) |
| Migrations not running | `database.migrations.skip: true` in config | Remove that config key for the `service-tokens` plugin |
| Frontend shows 403 on page load | Permission policy not registered | Confirm `permissionModuleServiceTokens` is added to `index.ts` and the backend was restarted |

---

## What's next

You now have a working foundation. Here's where to go from here:

- **[Configuration Reference](configuration.md)** — tune token lifetime, cache TTL, and add custom scopes for your own plugins
- **[REST API Reference](api.md)** — integrate service tokens into CI pipelines and automation scripts
- **[Production Readiness Guide](production-readiness.md)** — group-based admin access, policy merging, cache tuning, and audit log retention
- **[Architecture](architecture.md)** — understand how token verification works under the hood, including the auth handler wiring and scope propagation design
- **[Scope Enforcement Runbook](runbooks/scope-enforcement.md)** — optional guide for enforcing token scopes on specific routes in your own plugins
