# Spec — User Personal Access Tokens (End-to-End Verification)

**Status**: Draft — Phase 4 of Spec-Driven Development plan
**Companion documents**: [overview](./user-tokens-overview.md),
[API](./user-tokens-api.md), [architecture](./user-tokens-architecture.md),
[research](../research-notes.md).
**Scope**: The exact procedure to run against the local `e2e/harness/`
Backstage 1.49 app to prove the user-tokens capability is working
software. Pass criteria are binary; a single failure blocks the PR.

This is the **operator-facing test plan**. It contains nothing the
implementation needs to know — it is purely a script for a human (or a
human-supervised agent) to follow during release readiness.

## 0. Prerequisites

- Node 22 (the repo's `.nvmrc`)
- yarn (canonical for this repo — see memory note)
- `curl`, `jq`, `openssl`
- A modern desktop browser that permits popups for `localhost`

```bash
node --version    # → v22.x
yarn --version    # → 1.22+
curl --version | head -1
jq --version
```

## 1. Setup

Steps 1.1 – 1.4 are run once per fresh clone of the branch. They do not
change between verification runs.

### 1.1 Install repo dependencies

```bash
cd /path/to/backstage-service-token-plugin
yarn install --frozen-lockfile
```

### 1.2 Install harness dependencies

```bash
cd e2e/harness
yarn install
```

### 1.3 Generate an encryption key

```bash
openssl rand -base64 32
# → <PASTE_THIS_VALUE_INTO_app-config.yaml>
```

The 32-byte key is what AES-GCM uses to encrypt refresh tokens at rest
in the plugin DB. Keep it for the duration of the run; if you discard
it, the in-flight tokens cannot be decrypted later (and so cannot be
revoked through the UI).

### 1.4 Patch `e2e/harness/app-config.yaml`

Add the following keys. They are additive; nothing else needs to
change. The `auth.providers.guest.dangerouslyAllowOutsideDevelopment`
value should already be set by the harness.

```yaml
auth:
  experimentalDynamicClientRegistration:
    enabled: true
  experimentalRefreshToken:
    enabled: true

serviceTokens:
  userTokens:
    encryptionKey: '<paste the openssl output from §1.3>'
```

If the harness's permission policy is not yet aware of the
`user-tokens:*` permissions, also extend
`e2e/harness/packages/backend/src/serviceTokensPermissionPolicyModule.ts`
to ALLOW them for the calling user. See the Phase C section of the
verification plan in `/Users/adrian/.claude/plans/...` for the exact
diff (this file should not contain a per-deployment diff).

### 1.5 Start the harness

```bash
cd e2e/harness
yarn dev
```

You should see:

- `Listening on port 7007` from the backend.
- `Listening on port 3000` from the frontend.
- A log line **`user-tokens capability enabled at /api/service-tokens/personal/tokens`**
  emitted by the plugin's `plugin.js` (this confirms the experimental
  flags and the encryption key were read correctly). If you do not see
  this line, abort and re-check §1.4.

### 1.6 Smoke-check the OIDC discovery doc

Before signing in, confirm the OIDC discovery document is published
and the DCR endpoints are advertised:

```bash
curl -s http://localhost:7007/api/auth/.well-known/openid-configuration | jq .
```

**Pass criteria:**

- `authorization_endpoint`: `http://localhost:7007/api/auth/v1/authorize`
- `token_endpoint`: `http://localhost:7007/api/auth/v1/token`
- `registration_endpoint`: `http://localhost:7007/api/auth/v1/register`
  (must be present — confirms DCR is enabled)
- `revocation_endpoint`: `http://localhost:7007/api/auth/v1/revoke`
  (must be present — same reason)

Any missing field means §1.4 was applied incorrectly.

## 2. Procedure

Each user story (US-1 through US-5 from
[overview](./user-tokens-overview.md)) maps to a numbered step below.
The pass criterion for each is explicit and binary.

### 2.1 US-1 — Mint a token

1. Open `http://localhost:3000` in the browser. Sign in as guest.
2. Navigate to `/settings/personal-tokens`.
3. Click **Create token**.
4. Enter `name: my-ci-token`. Leave expiry at the default.
5. Click **Create**. A popup opens to the OAuth authorize URL.
6. Approve consent if Backstage shows the session-approval screen
   (DCR ships with a per-session approve-or-reject step).
7. The popup closes. The dialog updates to "Token created" with a
   readonly textbox containing the raw refresh token and a copy
   button.

**Pass criteria** (all must hold):

- The token visible in the UI starts with the `<sessionId>.<random>`
  shape (some bytes, a single dot, more bytes).
- The token panel shows the requested name.
- The copy button copies the token to the clipboard (verify by
  pasting in a terminal: it round-trips byte-for-byte).
- Closing the dialog removes the token from the UI permanently — the
  list shows the new row but the raw value is no longer visible
  anywhere.

Save the raw refresh token to a shell variable for later steps:

```bash
export RT='paste-the-raw-token-here'
```

### 2.2 US-2 — Use the token from a script

This is the load-bearing pass criterion for the v1 release.

```bash
# Step A — exchange refresh token for a short-lived JWT
JWT=$(curl -s -X POST http://localhost:7007/api/auth/v1/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=refresh_token&refresh_token=$RT" \
  | jq -r .access_token)
echo "JWT length: ${#JWT}"

# Step B — confirm the JWT authenticates as the user. The auth-backend
# exposes /v1/userinfo when DCR is enabled; it returns the user claims
# of the bearer.
curl -s -H "Authorization: Bearer $JWT" \
  http://localhost:7007/api/auth/v1/userinfo | jq .

# Step C — confirm the JWT works against an unrelated plugin (catalog)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $JWT" \
  http://localhost:7007/api/catalog/entities
```

**Pass criteria** (all must hold):

- Step A: `JWT length` > 100 (i.e., a real JWT, not an empty string).
- Step B: response contains `sub` matching the signed-in user (for
  guest it is `user:default/guest`).
- Step C: prints `200` (not 401, not 403).

### 2.3 US-3 — List my tokens

In the browser, refresh `/settings/personal-tokens`.

**Pass criteria**:

- The page shows the token from §2.1 with name `my-ci-token`,
  status `active`, created at the right timestamp, expiry at the
  configured default (30 days from now).
- The raw refresh token is NOT shown anywhere on this page.

### 2.4 US-4 — Revoke a token

1. In the row for `my-ci-token`, click **Revoke**.
2. Confirm in the dialog.
3. The row's status changes to `revoked` and the action button
   disappears.

Now re-run §2.2 Step A in the terminal:

```bash
curl -s -X POST http://localhost:7007/api/auth/v1/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=refresh_token&refresh_token=$RT"
```

**Pass criteria** (all must hold):

- The UI shows the revoked status.
- The terminal call returns a 4xx (typically 400 or 401 — RFC 7009
  says revoke should return 200, but a subsequent refresh-token grant
  on a revoked token MUST fail).
- The response body does not contain an `access_token` field.

### 2.5 US-5 — Tokens expire automatically

For a real test, mint a token with an explicit short expiry
(e.g. one minute) via the API directly:

```bash
# Replace <SESSION_COOKIE> with the cookie value from a browser session.
curl -s -X POST http://localhost:7007/api/service-tokens/personal/tokens/mint \
  -H "Cookie: <SESSION_COOKIE>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"expiry-test","expiresAt":"<ISO now+1min>"}'
```

Complete the popup OAuth dance, then sleep for over a minute, then
attempt the refresh-token exchange from §2.2 Step A.

**Pass criteria**:

- After the natural expiry, the refresh-token grant returns 4xx.
- The UI shows the row with `expired` status (refresh the page if
  needed).

(US-5 is the lowest-priority pass — auth-backend's
`OfflineAccessService` enforces it, not our plugin. Mark as a
deferred-but-passing check if time is tight.)

## 3. Negative tests

Two failure modes worth probing because they prove the threat model:

### 3.1 Cross-user isolation

Sign in as guest in browser A; mint a token. Sign in as a different
catalog user in browser B (if the harness has another resolvable
identity) and:

- Visit `/settings/personal-tokens` in B. **Pass**: the list is empty;
  the token minted in A is not visible.
- Direct-fetch GET `/api/service-tokens/personal/tokens/<id-from-A>`
  in B. **Pass**: returns 404 (not 403 — the spec mandates 404 so
  existence cannot be probed).

### 3.2 Encryption-key mismatch (manual)

1. Stop the harness.
2. Edit `e2e/harness/app-config.yaml` to change `encryptionKey` to a
   different base64 32-byte value.
3. Restart `yarn dev`.
4. Attempt to revoke an existing token from the UI.

**Pass criteria**: the revoke returns a 5xx error; the row remains
active. The plugin should not silently corrupt or skip the revoke.

(After running this test, restore the original key so subsequent
verification runs work.)

## 4. Result capture

Record the run's outcome in `docs/research-notes.md` under a new
"Phase 4 verification results" section, with this template:

```
Run timestamp: <ISO>
Harness commit: <git rev-parse HEAD>
Plugin commit: <feat/user-tokens HEAD>
Results:
  US-1 mint:         PASS / FAIL  (notes)
  US-2 script use:   PASS / FAIL  (notes)
  US-3 list:         PASS / FAIL  (notes)
  US-4 revoke:       PASS / FAIL  (notes)
  US-5 expiry:       PASS / FAIL / DEFERRED  (notes)
  3.1 cross-user:    PASS / FAIL / NOT TESTED  (notes)
  3.2 key mismatch:  PASS / FAIL / NOT TESTED  (notes)
Decision: ready for PR / not ready (defects)
```

A "ready for PR" outcome requires PASS on US-1, US-2, US-3, and US-4.
US-5, 3.1, and 3.2 are nice-to-have; their failure should be logged as
follow-up issues but does not block the v1 PR per the spec's
"non-goals" rules.

## 5. Troubleshooting

Likely failure modes and the first thing to check for each:

| Symptom | First check |
|---|---|
| Plugin init log line absent | `serviceTokens.userTokens.encryptionKey` is set to a 32-byte base64 string. Refusal logs are at WARN. |
| Discovery curl returns 404 | `auth.experimentalDynamicClientRegistration.enabled: true` is set. Restart the harness after editing. |
| Discovery missing `registration_endpoint` | Same as above — DCR flag is read at boot only. |
| Mint dialog spins, never resolves | Browser console: look for postMessage rejected by origin mismatch. The popup-callback should be same-origin as `localhost:3000`; if not, check the `cors` block in app-config. |
| Popup blocked | Browser-level popup blocker. Allow popups for `localhost` and retry. |
| `/v1/token` returns 401 on the script call | The token was revoked or expired. Mint a fresh one. |
| `/api/catalog/entities` returns 403 with a valid JWT | The catalog has no entities the user can see — try `/v1/userinfo` (§2.2 Step B) to confirm the JWT itself is valid. |

## 6. Non-goals for this verification

- Performance / load.
- Concurrent-mint race conditions (the in-flight store is in-memory
  and single-threaded; not stressed here).
- The Q-R6-a deferred audit decision — `/v1/token` calls are not
  audited by the plugin in v1, and verifying that gap is out of
  scope.
- Backstage version migration coverage (we test against 1.49 only).
