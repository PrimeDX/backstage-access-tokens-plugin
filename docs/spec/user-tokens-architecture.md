# Spec — User Personal Access Tokens (Architecture)

**Status**: Draft — Phase 2 of Spec-Driven Development plan
**Companion documents**: [overview](./user-tokens-overview.md),
[API](./user-tokens-api.md), [research](../research-notes.md).
**Scope**: Implementation-shaping decisions — how the plugin orchestrates
Backstage's native OAuth flow, where it stores state, which seams in the
existing service-token-plugin codebase it extends, and the threat model.

This document does NOT pin every internal function signature. It pins the
**architectural** choices that constrain implementation. Phase 4 will turn
this into concrete code.

## 1. Why "orchestrate, don't reinvent"

Research R3 establishes that `TokenFactory` is internal to
`@backstage/plugin-auth-backend` and cannot be called from a third-party
plugin. R1 shows that `@backstage/plugin-mcp-actions-backend` succeeds in
exposing user-principal credentials without any custom auth code, by
letting auth-backend's native OAuth flow produce JWTs that all other plugins
already accept via `coreServices.httpAuth`.

The architecture follows MCP's pattern verbatim:

- This plugin does **not** register an `externalTokenHandlersServiceRef`
  factory for user tokens. (Registering one would produce a service
  principal, not a user principal — see R3.)
- This plugin does **not** sign any JWTs, store any signing keys, or
  proxy `/api/auth/v1/token`.
- This plugin orchestrates the mint side (OAuth authorization code flow
  with DCR), captures the resulting `refresh_token` from `/v1/token`, and
  records metadata. Everything else — JWT minting, refresh-token storage,
  rotation, expiry enforcement, JWT verification — is auth-backend's job.

The result: from the catalog's perspective, a request authenticated with a
plugin-minted refresh token (then exchanged for a JWT) is indistinguishable
from a request authenticated with a refresh token minted any other way.
Permissions, ownership filtering, and audit identifiers all work as if the
user had signed in through a browser.

## 2. Mint orchestration

The mint flow is the only non-trivial piece. Three actors are involved:

- the user's **browser** (settings page),
- this **plugin's backend** (mint-initiation and OAuth-callback handler),
- Backstage's **auth-backend** (DCR registration, `/v1/authorize`, `/v1/token`,
  `OfflineAccessService`).

### 2.1 — DCR client registration

The plugin's backend registers a single OAuth client per Backstage instance
on first use, then caches the `client_id`/`client_secret` in its own table
(`personal_access_tokens_dcr_client`, see §6). On subsequent mints it reuses the same
client. The redirect URI is the plugin's own callback endpoint
(`/api/access-tokens/personal/mint/callback`, per
[API §1.2](./user-tokens-api.md#12--get-personaltokensmintcallback--oauth-callback)).

Operators who prefer a pre-registered client can configure one via
`accessTokens.personal.dcrClient` (per [API §4](./user-tokens-api.md#4-configuration-surface-app-configyaml)).
In that case DCR registration is skipped.

The plugin requests scopes `openid offline_access` per
[research-notes.md Q-R4-a](../research-notes.md#open-questions-surfaced-by-research),
which is what auth-backend's DCR registrar already grants by default.

**Discovery path**: the orchestrator fetches the OAuth/OIDC server
metadata from `<auth-backend-origin>/.well-known/openid-configuration`
(OIDC Discovery 1.0). Backstage does **not** mount the RFC 8414
`/.well-known/oauth-authorization-server` path; the OIDC variant
includes the same fields plus `registration_endpoint` and
`revocation_endpoint` when DCR is enabled. See
[research-notes Phase 4 R4-V3](../research-notes.md#phase-4-verification-readiness-post-implementation-research)
for the upstream source citation.

**Auth method note**: the plugin sends
`token_endpoint_auth_method: 'client_secret_post'` in the DCR
registration body, but Backstage's DCR schema does not validate that
field — it is silently ignored. As a result, `/v1/token` calls with
`grant_type=refresh_token` succeed against the resulting client
**without** presenting `client_id` or `client_secret`. This is the
behavior we want: any client that can make HTTP requests can exchange
the raw refresh token directly at `/api/auth/v1/token`, with no client
credentials to leak. See R4-V1 in the
research notes for the upstream code citation.

### 2.2 — In-flight mint store

`POST /personal/mint` creates an in-flight record that pairs the
caller's `userEntityRef`, the requested name/expiry, a freshly generated
`state` token, and a TTL (e.g., 10 minutes). This record lives in memory
keyed by `state` and `flowId`. (Memory, not DB — the lifespan is short and
losing it on restart is acceptable: the user just retries.)

When `/v1/token` callback arrives with `code` and `state`, the plugin:

1. Looks up the in-flight record by `state`; rejects if missing or expired.
2. Exchanges `code` for tokens at auth-backend's `/v1/token`.
3. Captures `refresh_token` from the JSON body (per R4 + Q-R4-a).
4. Extracts the `sessionId` from the refresh token (the `<sessionId>.<random>`
   prefix — per R4).
5. Encrypts the raw refresh token with AES-256-GCM under the operator's
   `encryptionKey` (12-byte random IV, 16-byte tag — both stored alongside
   the ciphertext).
6. Inserts a `personal_access_tokens` row tying the user's metadata, `sessionId`, and
   the encrypted-token columns.
7. Audits the mint event in `personal_access_token_audit_log`.
8. Returns the raw refresh token to the user's browser **exactly once
   via a same-tab 302 redirect** to
   `${app.baseUrl}/settings/personal-tokens#personal-access-tokens-mint=<base64-payload>`.
   The payload is `{ type, flowId, token, metadata }` JSON, base64url-
   encoded. The frontend's `UserTokensPage` detects the fragment on
   mount, decodes the payload, opens the create dialog directly in
   result mode, then calls `history.replaceState` to clear the
   fragment from the address bar.
9. Discards the in-flight record.

Error paths (state mismatch, OAuth error, token-exchange failure)
redirect to the same settings route with
`#personal-access-tokens-mint-error=<base64-message>` so the user lands on the
page with an inline `Alert` instead of a JSON 400.

The plugin stores the refresh token only in encrypted form (see §4
threat model). The encryption key never enters the DB; it lives in
operator config (`app-config.yaml` / secrets manager).

### 2.3 — Same-tab redirect, not a popup

The OAuth dance runs in the same browser tab as the rest of the
Backstage app: `window.location.href = authorizeUrl` to start it,
then a 302 fragment-redirect on completion (above) to return.
The frontend package ships `personalAccessTokensAuthPlugin`, which owns
`/oauth2/authorize/:sessionId` for this flow and renders the consent
step as "Create personal access token" rather than a generic
third-party-app grant.

**Why not a popup?** v1 prototyped a popup + `window.postMessage`
hand-off; verification surfaced four compounding failures:

1. Backstage's default `Content-Security-Policy` is
   `script-src 'self' 'unsafe-eval'` (no `'unsafe-inline'`). The
   popup's inline `<script>` was silently dropped by the browser,
   leaving the parent dialog stuck on "Awaiting authorization…"
   forever after the user clicked Authorize. Moving the script to a
   same-origin URL would have worked but required a separate
   asset-serving endpoint.
2. The frontend and backend run on different ports in any realistic
   Backstage deployment (`:3000` vs `:7007`). `Cross-Origin-Opener-
   Policy` strips `window.opener` across cross-origin navigations,
   so the popup could not call `window.opener.postMessage` even if
   its inline script had run.
3. Popup blockers and "user closed too early" reliability concerns.
4. The popup rendered the full Backstage app shell (sidebar, header),
   which is jarring UX for what should be a focused approval prompt.

Same-tab eliminates all four: no inline scripts (the fragment
handler is in the page's bundled JS, which CSP `'self'` allows), no
cross-origin opener handoff (the token arrives in the URL fragment
of the same browsing context), no popup blockers, no popup chrome.

**Trade-offs accepted**:

- The consent page renders in the user's main tab, inside the normal
  Backstage app shell. The plugin-provided page keeps the explicit
  approve/cancel step, but phrases it around token creation for the
  signed-in user and shows the callback as a subdued return URL.
- The URL fragment briefly carries the token in the address bar.
  Fragments are never sent to servers (no log leakage). The page
  clears the fragment via `history.replaceState` on mount, so it
  does not persist in browser history beyond the original entry.

## 3. Revocation

### 3.1 — Mechanism

The plugin's `DELETE /personal/:id` handler:

1. Looks up the `personal_access_tokens` row scoped to the calling user; returns 404
   if absent.
2. Issues a revocation call against auth-backend's
   `OfflineAccessService`, keyed by `sessionId`.
3. On success, marks the metadata row revoked and audits the event. On
   failure, returns 502 and leaves the row untouched (the user can retry).

### 3.2 — Revocation mechanism (Path B, post-spike)

Phase 4 spike on Q-R5-a established that:

- Backstage exposes **no plugin-accessible service ref** for refresh-token
  revocation. Path A from earlier drafts is not viable.
- Backstage **does** expose an RFC 7009-compliant `/v1/revoke` HTTP
  endpoint on the OIDC router when DCR is enabled. Path B is viable.
- `/v1/revoke` requires the **raw refresh token** plus the OAuth client
  credentials (`client_id` / `client_secret`).

To satisfy Path B's input requirement without violating Section 4's threat
model commitments, this plugin **stores the refresh token encrypted at
rest** (AES-256-GCM) under an operator-provided key
(`accessTokens.personal.encryptionKey`, per
[API §4](./user-tokens-api.md#4-configuration-surface-app-configyaml)).

Revocation flow:

1. Look up the `personal_access_tokens` row scoped to the calling user.
2. Decrypt `encrypted_token` using `encryptionKey`, `encrypted_token_iv`,
   `encrypted_token_tag`. Reject the call with 500 if decryption fails
   (key mismatch or DB corruption).
3. POST `/api/auth/oidc/v1/revoke` with the decrypted refresh token, the
   plugin's stored DCR `client_id` / `client_secret`, and
   `token_type_hint=refresh_token`.
4. On 200 from `/v1/revoke`, set `encrypted_token`, `encrypted_token_iv`,
   `encrypted_token_tag` to NULL and `revoked_at` to now. Audit the event.
5. On any non-200 from `/v1/revoke`, return 502 to the caller and leave
   the row untouched so the caller can retry. (RFC 7009 says the server
   SHOULD return 200 even for invalid tokens, so this case is rare.)

### 3.3 — Bulk revocation on user removal

If the user is deleted from the catalog, all their refresh tokens become
unusable automatically because auth-backend's catalog-presence check
(R5) rejects refresh on `/refresh`. The plugin does not need to
proactively revoke; it can offer a maintenance script later for cleanliness.

## 4. Threat model

| Threat | Mitigation |
|---|---|
| Refresh token captured in transit during mint | TLS terminates at Backstage; the token reaches the user's browser only via the same-tab 302 redirect's URL fragment and a single same-origin `history.replaceState` immediately after, so it is never logged server-side and never persisted in browser history. |
| Refresh token leaked through the URL fragment | Fragments are never transmitted in HTTP requests, so the token does not reach server access logs or referer headers. The page clears the fragment on mount via `history.replaceState`, removing it from the address bar and from subsequent history navigation. Worst case: a user who opens devtools mid-callback can read the fragment from `window.location.hash` before the clear runs — the token is one click away from the show-once dialog at that point, so this is not a new exposure. |
| Refresh token leaked from plugin DB | The plugin's DB stores the refresh token **encrypted with AES-256-GCM** under the operator-provided `encryptionKey`. DB exfiltration alone yields ciphertext + IV + tag; the encryption key is held in `app-config.yaml` (or an operator secret store) and is **not** in the DB. Recovering tokens requires both DB and key compromise. |
| Encryption key leaked from operator config | Combined with DB exfiltration this yields the raw refresh tokens. Mitigation: keep `encryptionKey` in a secrets manager, rotate operationally (rotation re-encrypts all rows; out of scope for v1). |
| Compromised plugin DB alone allows account takeover | No. The encrypted columns require the operator-held key. The `sessionId` alone (without the `<sessionId>.<randomBytes>` random tail) cannot be used to call `/refresh`. |
| Cross-user token enumeration | All management API endpoints filter by `request.userEntityRef`. `GET /personal/:id` returns 404 (not 403) for another user's token so existence cannot be probed. |
| In-flight mint state replay | `state` parameter is single-use; the in-flight record is deleted after callback. Out-of-band callback with an old `state` is rejected. |
| Fragment-payload injection from a third-party page | The fragment is only acted on by the `UserTokensPage` route's mount handler in our own bundled JS, which runs same-origin. A third party crafting a malicious URL `<frontend>/settings/personal-tokens#personal-access-tokens-mint=...` could only show the user a fake "show-once" dialog inside the user's own Backstage tab — the token value is whatever the attacker put in the fragment, so the worst case is social-engineering a user into copying a value chosen by an attacker. The fragment payload is **not** trusted server-side: no API accepts the fragment as a credential. Treated as a phishing/UI concern, not a privilege escalation. |
| Revocation latency / TOCTOU | Once auth-backend's `OfflineAccessService` invalidates the hash, every subsequent `/refresh` fails. There is no JWT-level revocation in v1 — short JWT lifetime (10 min default) bounds the window. |
| Token works after the user is removed from the catalog | Auth-backend's catalog-presence check (R5) fails the next `/refresh`. JWT lifetime bounds the residual access window. |
| Plugin-issued refresh token outlives auth-backend's `maxRotationLifetime` | Auth-backend enforces; plugin metadata expiry is advisory only. The plugin caps its own UI value at `auth-backend maxRotationLifetime` to avoid showing impossible expiries. |

## 5. Permission framework integration

Three new permissions are declared (per [API §3.1](./user-tokens-api.md#31--primedxplugin-access-tokens-node)):

- `access-tokens:user:read`
- `access-tokens:user:write`
- `access-tokens:user:revoke`

Each plugin-owned endpoint gates on the corresponding permission via the
same `createAuthorizeHelper(permissions, permission)` pattern the existing
service-token plugin uses (per R7).

**Default policy contribution**: the plugin ships a default policy that
returns `ALLOW` for the calling user when:

- `request.permission` is one of `access-tokens:user:{read,write,revoke}` AND
- the resource (if any) belongs to the calling user (the API enforces this
  too — defence in depth).

Operators who want a tighter policy can override it by wiring a more
restrictive `PermissionPolicy` in `packages/backend/src/`. This is the
"locked decision: any authenticated user can mint their own tokens" rule
from the plan, expressed through the framework rather than hardcoded.

## 6. Extensions to existing seams

Concrete mapping from R7:

| What | Where | How |
|---|---|---|
| Permissions registry | `plugin-access-tokens-backend/src/plugin.js:init()` | Add `permissionsRegistry.addPermissions(personalAccessTokensPermissions)` next to existing call. |
| HTTP routes | same `init()` | Mount a second Express router via `httpRouter.use(createUserTokensRouter(...))` under the existing plugin namespace. |
| Auth policies | same `init()` | Add `httpRouter.addAuthPolicy({ path: '/personal/*', allow: 'user-cookie' })` mirroring existing service-token policies. |
| Migrations | `plugin-access-tokens-backend/src/migrations.js` | Add idempotent `personal_access_tokens` and `personal_access_token_audit_log` table creators inside `applyServiceTokenMigrations`. |
| In-flight mint store | new file `plugin-access-tokens-backend/src/userTokens/mintFlow.js` | In-memory `Map<state, flowRecord>` with TTL eviction. |
| DCR client cache | new table `personal_access_tokens_dcr_client` (single-row) | Stored in same DB; pre-registered config takes priority. |
| Frontend page | new `plugin-access-tokens/src/UserTokensPage.jsx` plus sibling components | Registered via `SubPageBlueprint.make` attached to `page:user-settings`, so it appears as the `Personal Access Tokens` tab at `/settings/personal-tokens`. |
| Show-once dialog | new `plugin-access-tokens/src/components/CreateUserTokenDialog.jsx` | Port the dual-mode pattern from `backstage-pat-plugin/src/components/CreatePATDialog.tsx` (per R8). |
| Routes module | new `personalAccessTokensRouteRef` in `plugin-access-tokens/src/routes.js` | Added alongside the existing `rootRouteRef`. |

The `plugin-access-tokens-node` package gains the three new permission
exports and nothing else. No new external-token-handler is exported (see §1).

## 7. Operational concerns

- **Migrations are additive** — no downtime, no data conversion.
- **Two new tables** plus optional `personal_access_tokens_dcr_client` singleton row.
- **No new long-running processes** beyond the existing
  `OfflineAccessService` hourly cleanup which we inherit.
- **Logging**: every mint, callback, list, and revoke emits a structured
  log line via `coreServices.logger`. Audit-log table captures the same
  events in the plugin's own DB for the UI to render.
- **Failure modes**:
  - Auth-backend's experimental flags unset → plugin refuses to mount
    personal-access-token routes (per [API §4](./user-tokens-api.md#4-configuration-surface-app-configyaml)).
  - DCR registration fails → mint endpoint returns 502 with the underlying
    error.
  - `/v1/token` exchange fails → callback returns 502, in-flight record
    cleared, no metadata row written.
  - Revocation API fails (Q-R5-a residual) → metadata row left unchanged,
    502 returned, user can retry.

## 8. What is explicitly NOT in v1

- **JWT-level revocation**: a JWT minted before revocation remains valid
  until its short lifetime expires (default 10 min). Acceptable.
- **Token rotation visibility**: the user does not see the rolling
  `sessionId` as it rotates on each `/refresh`. They paste the original
  `refresh_token` and use it; rotation is invisible. Listing shows the
  original `sessionId` only.
- **Refresh-token exchange audit**: emission only on plugin-owned actions,
  not on every `/api/auth/v1/token` call (Q-R6-a decision).
- **Scope selection**: the OAuth flow requests fixed scopes
  (`openid offline_access`). Per-token scope selection is a future feature.
- **CLI helper**: a small standalone `bsut` CLI to do the mint dance from
  a terminal would be a nice convenience but is out of scope for v1.

## 9. Verification — what proves this architecture is right

Beyond the API and DB tests in [API §6](./user-tokens-api.md#6-verification--what-proves-this-spec-is-satisfied):

1. **Principal-type test**: in an integration test, mint a token, exchange
   it for a JWT, call a probe endpoint that asserts
   `credentials.principal.type === 'user' && credentials.principal.userEntityRef === <minter>`.
2. **No-leak test**: prove via DB inspection after a mint that the raw
   refresh token never appears in any plugin table — only `sessionId`.
3. **Cross-instance compatibility**: a refresh token minted via the plugin
   must work when called against `/api/auth/v1/token` directly,
   independent of whether this plugin is installed at the time of refresh.
   (Demonstrates that the plugin is truly a UX shim, not on the critical
   path of authentication.)
4. **Revocation propagation**: revoke from the plugin UI, then attempt
   `/refresh` against auth-backend's endpoint — must fail.
