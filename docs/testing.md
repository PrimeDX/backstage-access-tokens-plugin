# Testing the Service Token Plugin

Audience: adopters and operators validating an installed plugin in a local or pre-production Backstage environment.

Use this guide to confirm the plugin works end to end after installation. For unpublished package work or local `file:` installs, use the maintainer-focused [Developer Test Guide](developer-test-guide.md).

By the end of this guide you should be able to verify:

- the admin UI loads and performs the main token lifecycle actions
- the REST API returns the documented request and response shapes
- raw service tokens authenticate against Backstage backend routes
- revocation and permission checks behave as expected

The frontend UI at `/admin/service-tokens` provides a full page experience: token list with filters, a **Create token** button, and **Audit** / **Revoke** actions per row — all wired to the backend. Choose the path that suits your workflow:

---

## Choose your testing path

| Path | What it tests |
|------|---------------|
| Path A — API Testing | Full end-to-end via `curl` — no browser required |
| Path B — UI Testing | Full end-to-end via the browser UI |
| Path C — Playwright Smoke | Focused create → audit → revoke UI smoke path |

Paths A and B cover the same scenarios (create, list, audit, revoke, permission enforcement). Path C is intentionally narrower: it validates the primary admin UI flow against a local harness. You can also mix the paths — for example, create via the UI and verify via the API.

---

## Prerequisites

### 1. Use Node 22

```bash
source ~/.nvm/nvm.sh
nvm use 22
```

### 2. Start the backend

```bash
cd /path/to/your-backstage-app
yarn workspace backend start
```

Wait until the backend is listening on `http://localhost:7007`.

### 3. Start the frontend (separate terminal)

```bash
cd /path/to/your-backstage-app
yarn workspace app start
```

Wait until you see `Rspack compiled successfully` in the output.

---

## Path A — API Testing

### Step A1 — Get a Guest Backstage Token

The guest auth provider issues a short-lived Backstage identity token. Capture it with:

```bash
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' \
  | jq -r '.backstageIdentity.token')

echo "TOKEN=$TOKEN"
```

> **Note:** `jq` must be installed. If not: `sudo apt install jq`.  
> The token is valid for a short period. Re-run this command if you get 401 responses later.

Verify the token decodes to the guest identity:

```bash
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .
# Expected: "sub": "user:development/guest"
```

---

### Step A2 — UI Smoke Test

Open a browser and navigate to:

```
http://localhost:3000/admin/service-tokens
```

**Expected result:**
- The page loads with the title **"Service Tokens"**.
- The filter bar and **Create token** button are visible.
- The table renders in a loading state briefly, then shows an empty state (no tokens yet).
- No 401 or 403 error is displayed.

This confirms that:
- The frontend plugin is wired and the route is registered.
- The guest user has the service token permissions required by the UI flow (`service-tokens:read`, `service-tokens:write`, and `service-tokens:revoke`), granted by your permission policy using `serviceTokens.admin.userEntityRefs` in `app-config.yaml`.

---

### Step A3 — List Available Scopes

```bash
curl -s http://localhost:7007/api/service-tokens/scopes \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected response:**

```json
{
  "scopes": [
    { "id": "catalog:read",       "description": "Read access to the Software Catalog API",    "plugin": "catalog" },
    { "id": "catalog:write",      "description": "Write access to the Software Catalog API",   "plugin": "catalog" },
    { "id": "techdocs:read",      "description": "Read access to TechDocs",                    "plugin": "techdocs" },
    { "id": "scaffolder:read",    "description": "Read access to Scaffolder templates and tasks", "plugin": "scaffolder" },
    { "id": "scaffolder:execute", "description": "Execute Scaffolder templates",               "plugin": "scaffolder" }
  ]
}
```

---

### Step A4 — List Tokens (Empty)

```bash
curl -s http://localhost:7007/api/service-tokens \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected response:**

```json
{ "tokens": [], "total": 0, "limit": 50, "offset": 0 }
```

---

### Step A5 — Create a Service Token

```bash
RESPONSE=$(curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-token",
    "description": "Created during plugin testing",
    "groupEntityRef": "group:default/guests",
    "scopes": ["catalog:read"],
    "expiresInDays": 30
  }')

echo "$RESPONSE" | jq .
```

**Expected response:**

```json
{
  "token": {
    "id": "<uuid>",
    "name": "test-token",
    "description": "Created during plugin testing",
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

Capture the `id` and `rawToken` for subsequent steps:

```bash
TOKEN_ID=$(echo "$RESPONSE" | jq -r '.token.id')
RAW_TOKEN=$(echo "$RESPONSE" | jq -r '.rawToken')

echo "TOKEN_ID=$TOKEN_ID"
echo "RAW_TOKEN=$RAW_TOKEN"
```

> **Important:** The `rawToken` is shown **only once** at creation time. It cannot be retrieved again. Store it now.

---

### Step A6 — Confirm Token Appears in the UI

Refresh the browser at `http://localhost:3000/admin/service-tokens`.

**Expected result:** The table now shows one row for `test-token` with status **Active**.

---

### Step A7 — Inspect the Audit Log

```bash
curl -s http://localhost:7007/api/service-tokens/$TOKEN_ID/audit \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected response:**

```json
{
  "events": [
    {
      "id": "<uuid>",
      "tokenId": "<TOKEN_ID>",
      "event": "created",
      "actor": "user:development/guest",
      "metadata": {},
      "occurredAt": "<timestamp>"
    }
  ]
}
```

---

### Step A8 — Use the Raw Token Against the Catalog API

The raw token authenticates as the group `group:default/guests` via the `backstage-service-token` external access handler.

```bash
curl -s "http://localhost:7007/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer $RAW_TOKEN" | jq .
```

**Expected result:** HTTP 200 with a JSON array containing at least one catalog entity. This confirms the raw token is accepted by the Backstage auth layer and the service token handler resolves it correctly.

---

### Step A9 — Revoke the Token

```bash
curl -s -X DELETE http://localhost:7007/api/service-tokens/$TOKEN_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "testing revocation flow"}' \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected result:** HTTP `204 No Content`.

---

### Step A10 — Confirm Token Is Revoked

#### Get the individual token record

```bash
curl -s http://localhost:7007/api/service-tokens/$TOKEN_ID \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:** `"status": "revoked"` in the response.

#### Confirm the audit log has a revoked event

```bash
curl -s http://localhost:7007/api/service-tokens/$TOKEN_ID/audit \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:** Two events in newest-first order:

- `revoked` with `metadata.reason = "testing revocation flow"`
- `created` with empty `metadata`

#### Filter the list by status

```bash
curl -s "http://localhost:7007/api/service-tokens?status=revoked" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:** The revoked token appears in the list.

#### Confirm the raw token no longer works

```bash
curl -s "http://localhost:7007/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer $RAW_TOKEN" \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** HTTP `401 Unauthorized` once revocation has propagated through the configured cache TTL. If your app keeps the default `serviceTokens.cacheTtlSeconds: 60`, wait up to 60 seconds; for deterministic local checks, set the TTL to `0`.

---

### Step A11 — Permission Enforcement

#### 11a — No token (unauthenticated)

```bash
curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Content-Type: application/json" \
  -d '{"name":"should-fail","groupEntityRef":"group:default/guests","scopes":["catalog:read"]}' \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** HTTP `401 Unauthorized`.

#### 11b — Non-admin user (403 path)

The permission policy grants the service token management permissions only to users listed in `serviceTokens.admin.userEntityRefs`. To demonstrate the 403 path, add a second user to `org.yaml` and `app-config.yaml` who is **not** in the admin list, then obtain their token.

**Quick demo without a second user account:** temporarily remove `user:development/guest` from `app-config.yaml`:

```yaml
# app-config.yaml — temporarily change to an empty list to simulate a non-admin
serviceTokens:
  admin:
    userEntityRefs: []
```

Restart the backend, obtain a fresh guest token, then call:

```bash
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' | jq -r '.backstageIdentity.token')

curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"should-fail","groupEntityRef":"group:default/guests","scopes":["catalog:read"]}' \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** HTTP `403 Forbidden` with body `{"error":"Forbidden: admin access required"}`.

Restore the original config and restart the backend before continuing.

---

### Step A12 — Cleanup

The service token data is persisted in a SQLite file at `/tmp/service-tokens.sqlite`. To reset all token state:

```bash
rm /tmp/service-tokens.sqlite
```

The file is recreated with fresh migrations on the next backend start.

---

## Path B — UI Testing

This path exercises the same scenarios entirely through the browser. Start both the backend and frontend as described in [Prerequisites](#prerequisites) before beginning.

---

### Step B1 — Navigate to the page

Open a browser and go to:

```
http://localhost:3000/admin/service-tokens
```

**Expected:**
- The page loads with the **"Service Tokens"** header and subtitle.
- A filter bar (Status dropdown + Group field) and a **Create token** button are visible at the top.
- The table shows an empty state: *"No service tokens yet"*.
- No 401 or 403 error is displayed.

---

### Step B2 — Create a token via the UI

1. Click the **Create token** button.
2. The **Create service token** dialog opens.
3. Fill in the form:
   - **Name:** `ui-test-token`
   - **Description:** `Created via UI during testing`
   - **Owning group:** select `group:default/guests` from the dropdown
   - **Permissions:** check `catalog:read`
   - **Expiry date:** pick any date at least one day in the future (defaults to 30 days)
4. Click **Create token**.

**Expected during submission:** The button shows a spinner and reads *"Creating…"*.

**Expected on success:** The dialog switches to a success step showing:
- A green checkmark icon.
- The message *"Copy this token now. It will **not** be shown again."*
- The raw token string in a monospace box with a copy icon.

5. Click the copy icon to copy the raw token to your clipboard. Save it — you will need it in Step B7.
6. Click **Done**.

**Expected after closing:** The dialog closes and the table now shows one row for `ui-test-token` with status **Active**.

---

### Step B3 — Filter the list

1. In the **Status** dropdown, select `Active`.
   - **Expected:** Only active tokens are shown. `ui-test-token` remains visible.
2. In the **Group** field, type `group:default/guests`.
   - **Expected:** `ui-test-token` still appears (it belongs to that group).
3. Click **Clear** to reset both filters.
   - **Expected:** All tokens are shown again.

---

### Step B4 — View the audit log

1. Click the **Audit** button on the `ui-test-token` row.
2. The **Audit log — ui-test-token** dialog opens.

**Expected:**
- One row in the table with event chip **created** (blue).
- Actor: `user:development/guest`.
- Reason: `—` (none).
- A timestamp for when the token was created.

3. Click **Close**.

---

### Step B5 — Revoke the token via the UI

1. Click the **Revoke** button on the `ui-test-token` row.
2. The **Revoke token?** dialog opens, showing a warning icon, the token name (`ui-test-token`), its group, and a reason field.
3. Enter reason: `testing revocation via UI`
4. Click **Revoke**.

**Expected during submission:** The button shows a spinner and reads *"Revoking…"*.

**Expected after closing:** The dialog closes and the `ui-test-token` row now shows a **Revoked** status chip. The Revoke button for that row is disabled.

---

### Step B6 — Confirm revocation in the audit log

1. Click **Audit** on the `ui-test-token` row.

**Expected:**
- Two rows in the audit table:
  1. **revoked** (red chip) — `user:development/guest` — reason: `testing revocation via UI`
  2. **created** — `user:development/guest` — no reason

2. Click **Close**.

---

### Step B7 — Confirm the raw token no longer works

Use the raw token you copied in Step B2:

```bash
curl -s "http://localhost:7007/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer <raw-token-from-B2>" \
  -w "\nHTTP status: %{http_code}\n"
```

**Expected:** HTTP `401 Unauthorized` once revocation has propagated through the configured cache TTL. If your local app sets `serviceTokens.cacheTtlSeconds: 0`, this happens immediately.

---

### Step B8 — Filter by revoked status

1. In the **Status** dropdown, select `Revoked`.

**Expected:** `ui-test-token` appears in the list with a **Revoked** chip.

2. Click **Clear** to reset.

---

### Step B9 — Cleanup

Reset all token state by removing the SQLite database:

```bash
rm /tmp/service-tokens.sqlite
```

The file is recreated with fresh migrations on the next backend start.

---

## Current UI capabilities

The frontend page at `/admin/service-tokens`:

- ✅ Fetches and renders the token list (with loading/error/empty states)
- ✅ Filter bar — status dropdown + group text field, wired to re-fetch on change
- ✅ **Create token** button opens `CreateTokenDialog` — full form with name, description, group selector, scope checkboxes, expiry date, and a success step with copy-to-clipboard
- ✅ **Revoke** button per row opens `RevokeDialog` — confirmation with optional reason, disabled for already-revoked tokens
- ✅ **Audit** button per row opens `AuditLogDialog` — event table with action chips, actor, reason, and timestamp

---

## Path C — Playwright Smoke

This path is a focused smoke test for the primary admin UI flow. It is designed to complement, not replace, the API path:

- `scripts/test-api.sh` validates contract and auth behavior
- Playwright validates that the user-facing create → audit → revoke flow still works

### What it covers

- page load at `/admin/service-tokens`
- create dialog happy path
- one-time raw token display after creation
- audit log rendering
- revoke flow
- newest-first audit ordering after revoke

### What it does not cover yet

- every permission-denied branch
- backend error state rendering
- cross-browser matrix coverage

### Prerequisites

- Node `22`
- the plugin repo dependencies installed
- a local Backstage harness already running
- `serviceTokens.cacheTtlSeconds: 0` in the harness local config so revocation checks are deterministic

### Run the smoke test

With your harness already running:

```bash
cd /path/to/backstage-service-token-plugin
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui-smoke
```

Optional headed mode:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui-smoke:headed
```

Expected:

- the page loads successfully
- the smoke test creates a uniquely named token for `group:default/platform`
- the success dialog shows a raw token once
- the audit dialog first shows `created`
- the token is revoked with a reason
- the audit dialog then shows `revoked` followed by `created`

If your local harness uses `file:` dependencies, refresh them with `yarn install` after package changes so the app picks up the current package snapshot.

### CI coverage

Pull requests and `main` pushes run this same smoke spec in GitHub Actions through the `CI / ui-smoke` job. The job installs root and harness dependencies, then Playwright starts and waits for `e2e/harness` via `webServer` while executing:

```bash
PLAYWRIGHT_HARNESS_DIR=e2e/harness PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_USE_SYSTEM_CHROME=false npm run test:ui-smoke
```

If it fails, inspect the uploaded `ui-smoke-artifacts` bundle (`playwright-report` and `test-results`) and the `Run UI smoke test` logs for Playwright `webServer` startup output.
