# Research Notes — User-Principal Tokens for Backstage

These notes are the Phase 1 output for the Spec-Driven Development plan adding
**user-principal tokens** to this plugin family alongside the existing
service-principal tokens. Every claim cites a primary source so that the
specification documents downstream can be reviewed against the same evidence.

These notes were authored as the Phase 1 output of the SDD plan; the
plan itself lives outside the repo. Read these notes top-to-bottom for
the architectural picture, then move on to the spec documents in
`docs/spec/`.

## R1 — MCP plugin's actual auth surface

**Finding**: `@backstage/plugin-mcp-actions-backend` performs **no custom
bearer-token handling**. Routes are mounted through the standard
`coreServices.httpAuth` middleware, which inherits whatever credentials the
framework's auth pipeline already accepts. The plugin exposes
`/.well-known/oauth-protected-resource` per RFC 9728 so MCP clients can
discover the OAuth authorization server, but the actual token validation
happens upstream in core auth, not in plugin code.

**Implication**: any plugin that wants user-principal calls reaches that goal
the same way MCP does — by letting Backstage's core auth pipeline accept a
user-issued JWT, then trusting `httpAuth.credentials(req, { allow: ['user'] })`
to extract the user principal. There is no special MCP-only auth machinery.

**Sources**:
- `plugins/mcp-actions-backend/README.md` — documents "configure your MCP
  client to use it in the Authorization header" with Bearer scheme; references
  static tokens and DCR as auth methods.
- `plugins/mcp-actions-backend/src/plugin.ts` — registers `httpAuth` and
  `auth` core services as dependencies; exposes the RFC 9728 discovery
  document; no custom verifier.
- `plugins/auth-backend/src/authPlugin.ts` — `OfflineAccessService` instantiated
  when `auth.experimentalRefreshToken.enabled` is true.

**Confidence**: high.

## R2 — DCR + experimental refresh-token configuration flags

**Finding**: Two configuration flags gate the refresh-token machinery:

- `auth.experimentalRefreshToken.enabled` activates the `OfflineAccessService`
  in auth-backend, which manages refresh-token issuance, rotation, storage in
  `OfflineSessionDatabase`, and revocation.
- `auth.experimentalDynamicClientRegistration.enabled` activates RFC 7591
  dynamic OAuth client registration so external apps can self-register
  without admin pre-configuration.

Refresh-token policy (defaults from `plugins/auth-backend/config.d.ts`):

| Setting | Default |
|---|---|
| Single refresh-token lifetime (`tokenLifetime`) | `30 days` |
| Maximum session lifetime across rotations (`maxRotationLifetime`) | `1 year` |
| Maximum refresh tokens per user (`maxTokensPerUser`) | `20` |

Rotation is atomic: each `/refresh` invocation invalidates the prior token and
issues a new one. The user must still exist in the catalog at refresh time
(`dangerouslyDisableCatalogPresenceCheck` can override this).

**Implication**: a refresh token is a working, native long-lived credential
(30 days default, up to 1 year). Pairing one with a script-driven `/refresh`
call gives a working PAT-equivalent without inventing a new bearer scheme.

**Sources**:
- `plugins/auth-backend/config.d.ts` — `experimentalRefreshToken.enabled`,
  `tokenLifetime`, `maxRotationLifetime`, `maxTokensPerUser`.
- `plugins/auth-backend/config.d.ts` — `experimentalDynamicClientRegistration.enabled`,
  `allowedRedirectUriPatterns`.
- `plugins/auth-backend/src/authPlugin.ts` — `OfflineAccessService`
  instantiation gated on the refresh-tokens flag.
- `plugins/auth-backend/src/service/OfflineAccessService.ts` — atomic rotation,
  hash-based validation, hourly cleanup, catalog presence check.

**Confidence**: high — direct config-schema and service-code citations.

## R3 — Can a plugin mint user JWTs directly?

**Finding**: **No.** `TokenFactory` is internal to `@backstage/plugin-auth-backend`
and is not exported via `coreServices` or any other public service ref. Its
public method `issueToken({ claims: { ent: string[] }, ... })` produces a JWT
with `sub` (user entity ref), `ent` (ownership claims), `iss`, `aud`, `exp`,
`iat`, `uip`, but only auth-backend code can call it.

The closest plugin-accessible APIs are:
- `coreServices.auth.getOwnServiceCredentials()` / `getPluginRequestToken(...)`
  — these mint **service** tokens, not user tokens.
- `coreServices.httpAuth.credentials(req, { allow: ['user'] })` — extracts a
  user principal from a request that already carries a user JWT, but cannot
  mint one for an arbitrary user.

**Implication (load-bearing for the spec)**: this plugin cannot synthesize a
user JWT from scratch. Any "user-token" flow we design must obtain credentials
by **going through auth-backend's standard OAuth pipeline**, then either store
the resulting refresh token (so external clients can exchange it) or wrap it
behind a friendlier UX. We cannot, for example, accept an admin's request to
"mint a token for `user:default/alice`" and return a JWT — only Alice herself,
authenticated through an OAuth provider, can produce one.

This eliminates a tempting design (plugin signs its own long-lived user JWTs)
and forces an OAuth-orchestration design.

**Sources**:
- `plugins/auth-backend/src/identity/TokenFactory.ts` — `issueToken()`
  signature and JWT payload structure (`sub`, `ent`, `iss`, `aud`, `exp`,
  `iat`, `uip`).
- `plugins/auth-backend/src/authPlugin.ts` — `TokenFactory` instantiated
  privately; not registered in `coreServices`.
- `plugins/auth-backend/README.md` — token expiration ranges (10 min to
  24 hrs) for the access JWT.

**Confidence**: high — direct code reading. (The inaccessibility is inferred
from absence in public service exports; if a private workaround exists it
would still violate the spirit of `coreServices` and be ill-advised.)

## R4 — Refresh-token endpoint contract

**Finding**: The provider router registers both `GET` and `POST` on
`/api/auth/:provider/refresh`, both bound to the provider's `refresh` method.

Refresh-token format: `<sessionId>.<randomBytes>` where the random portion is
32 bytes base64url-encoded. The token is hashed with scrypt
(`N=16384, r=8, p=1`, 16-byte salt) before storage and verified via
timing-safe comparison. Rotation is automatic: a successful `/refresh`
invalidates the inbound token and issues a new one as part of the same
response.

Provider implementations determine the **wire shape** for both the request
and the response. For traditional Backstage OAuth providers the refresh token
historically arrives via a cookie (`<provider>-refresh-token`), and the
response is a `BackstageSignInResult` envelope containing a fresh JWT and
ownership claims.

**Implication (gap)**: the research did not confirm whether DCR's OAuth flow
exposes refresh tokens through the standard RFC 6749 `/token` JSON endpoint
or only through cookies. That distinction matters: a cookie-bound refresh
token is hard to hand to a CI script. **This is an open question (Q-R4-a in
the Open Questions section below.)**

**Sources**:
- `plugins/auth-backend/src/providers/router.ts` — registers
  `r.get('/refresh', provider.refresh.bind(provider))` and the POST sibling.
- `plugins/auth-backend/src/lib/refreshToken.ts` — `generateRefreshToken()`
  format, scrypt parameters, `verifyRefreshToken()` timing-safe comparison.
- `plugins/auth-backend/src/service/OfflineAccessService.ts` — rotation,
  hash verification.

**Confidence**: medium for the endpoint surface; low for the DCR-vs-cookie
distinction (needs a follow-up read against the DCR routes specifically).

## R5 — Refresh-token storage and revocation

**Finding**: Refresh tokens are persisted via `OfflineSessionDatabase` in
auth-backend, stored as scrypt hashes. `OfflineAccessService` exposes:

- per-token revocation by token ID,
- bulk revocation of all tokens belonging to a user,
- implicit enumeration via the "all tokens for user" code path,
- an hourly cleanup job that prunes expired sessions,
- a default catalog-presence check (the user must still exist in the catalog
  at refresh time; opt out via `dangerouslyDisableCatalogPresenceCheck`).

The plugin warning is that SQLite lacks row-level locking, so PostgreSQL is
recommended for production to avoid concurrent-rotation race conditions.

**Implication**: a plugin can *delegate* the storage and revocation of
refresh tokens to auth-backend, but the research did not find a public
service ref to drive `OfflineAccessService` from outside auth-backend itself.
The plugin most likely needs to maintain its own metadata table (name,
created_by, created_at, last_used_at, optional alias for the auth-backend
session ID) and call `/api/auth/...` endpoints rather than poke
`OfflineAccessService` directly. **Open question Q-R5-a below.**

**Sources**:
- `plugins/auth-backend/src/service/OfflineAccessService.ts` — DB persistence,
  per-token and bulk revocation APIs, hash-based validation, catalog
  presence check, hourly cleanup, SQLite/Postgres concurrency note.
- `plugins/auth-backend/config.d.ts` — `dangerouslyDisableCatalogPresenceCheck`.

**Confidence**: high for the service's existence and capabilities; medium for
plugin accessibility (no public service ref found in the upstream research).

## R6 — Audit / observability for refresh-token use

**Finding**: The auth-backend does **not** emit structured audit events when a
refresh token is exchanged for a JWT. `OfflineAccessService` receives a
logger but no `auditor` service, and the code paths examined make no calls
to `auditor.audit()` or its equivalent. Refresh-token usage is therefore
observable only via plain log lines today.

**Implication**: if user-token usage needs an audit trail (who used which
token when, from where), this plugin will likely need to provide that
itself — either by wrapping the refresh call in its own audit-emitting
proxy, or by deriving usage events from access logs. Pure delegation to
auth-backend does not give us an audit story.

**Sources**:
- `plugins/auth-backend/src/authPlugin.ts` — `OfflineAccessService`
  instantiated with logger only, no auditor passed in.
- `plugins/auth-backend/src/service/OfflineAccessService.ts` — accepts
  logger, database, lifecycle, catalog, auth services; no audit emission.
- `plugins/auth-backend/src/lib/refreshToken.ts` — token-level cryptography
  only.

**Confidence**: medium — based on absence in the examined code, not
exhaustive grep. A follow-up scan for `auditor` references near refresh
paths would raise confidence.

## R7 — Existing seams in `backstage-access-tokens-plugin`

**Finding**: The plugin is built on the new backend and new frontend systems
and exposes clean extension points that accommodate a parallel user-token code
path without disturbing the existing service-token capability.

**Backend extension points** (`packages/plugin-access-tokens-backend/src/plugin.js`):
- `permissionsRegistry.addPermissions(serviceAccessTokensPermissions)` registers the
  permission set. A symmetric `addPermissions(personalAccessTokensPermissions)` would
  declare the new permissions cleanly.
- Routes are mounted via `httpRouter.use(createExpressRouter(...))`. A second
  Express router mounted under a different path (e.g. `/personal/...` inside
  the same plugin namespace) keeps personal-access-token routes isolated.
- Auth policy declared via `httpRouter.addAuthPolicy({ path: '/...', allow: 'user-cookie' })`
  — interestingly `'user-cookie'` is used, not `'user'`, so today's routes are
  intended for browser sessions only. User-token mint endpoints likely need
  the same scope, but verify in the spec.

**Database schema** (`packages/plugin-access-tokens-backend/src/migrations.js`):
- Existing table `service_access_tokens` keys on `(group_entity_ref, name)` unique.
- For user tokens the natural subject is `user_entity_ref`, so the uniqueness
  constraint differs (per-user vs per-group). A new `personal_access_tokens` table is the
  cleaner option; reusing the existing table with a `subject_type` column would
  collide on the unique index and complicate migrations. The spec should
  prefer a new table unless a stronger reason emerges.
- The existing `service_access_token_audit_log` table is keyed on `token_id`
  referencing `service_access_tokens.id`. A parallel `personal_access_token_audit_log` mirrors
  this for separation, or audit events can carry a `token_kind` discriminator.
  Spec decision.

**Frontend extension points** (`packages/plugin-access-tokens/src/index.js`,
`routes.js`):
- `createFrontendPlugin` already registers one `PageBlueprint` at
  `/admin/access-tokens` via `rootRouteRef`. Adding a second `PageBlueprint`
  at `/settings/personal-tokens` (or similar) with a new `routeRef` is the
  symmetric pattern.
- Components live under `src/components/` and are imported lazily by the page
  loader. Adding a sibling `UserTokensPage.jsx` plus user-specific dialog and
  table components follows the existing layout.

**Node package (`plugin-access-tokens-node`)**: holds shared constants, the
external token handler, permissions, and the auth module factory. For user
tokens, the equivalent shared exports would be `personalAccessTokensPermissions`,
`userTokenHandlerModule` (if a custom handler is needed — see R1–R3 to
determine), and any helper utilities.

**Sources**:
- `packages/plugin-access-tokens-backend/src/plugin.js:32-103` — plugin
  registration, permission registry call, HTTP router mounting, auth policies.
- `packages/plugin-access-tokens-backend/src/migrations.js:1-40` — schema
  definitions for `service_access_tokens` and `service_access_token_audit_log`.
- `packages/plugin-access-tokens/src/index.js:1-25` — frontend plugin
  blueprint that registers the admin page at `/admin/access-tokens`.
- `packages/plugin-access-tokens/src/routes.js:1-3` — route ref pattern.

**Confidence**: high — direct code reading.

## R8 — UX precedent from `backstage-pat-plugin`

**Finding**: One pattern from the abandoned PAT plugin is worth porting; the
remainder is superseded by what `backstage-access-tokens-plugin` already
provides.

**Worth porting — the show-once dialog idiom**
(`backstage-plugin-pat/src/components/CreatePATDialog.tsx`):
- Dual-mode dialog: a form mode for entering name/expiry, and a result mode
  that renders the raw token exactly once with a clear warning
  (`"This token will not be shown again. Copy it now."`) and a clipboard-copy
  button.
- This pattern is more user-facing than the existing service-token
  `CreateTokenDialog.jsx` (which targets admins) and matches the PAT mental
  model end users expect.
- Action: lift the show-once UX into a new `CreatePersonalTokenDialog.jsx`
  inside the access-tokens plugin frontend, adapting to the project's
  conventions (MUI imports, `.jsx` extension, prop shape that fits the new
  API).

**Not worth porting — list and page components**
(`PATList.tsx`, `PATSettingsPage.tsx`):
- `ServiceTokensTableView.jsx` and `ServiceTokensPage.jsx` in the target repo
  already implement a richer table (with filters, status chips, audit log
  dialog) and page (with loading and error states). The PAT plugin's versions
  are simpler but functionally a strict subset.
- Action: model the user-token page on `ServiceTokensPage.jsx` and adapt
  `ServiceTokensTableView.jsx` to display user-relevant columns (name,
  created, expires, last used) rather than service-relevant columns (group,
  scopes).

**Sources**:
- `/Volumes/ADD_Dock/src/backstage-pat-plugin/backstage-plugin-pat/src/components/CreatePATDialog.tsx`
  — 102 lines, dual-mode show-once dialog implementation worth porting.
- `/Volumes/ADD_Dock/src/backstage-pat-plugin/backstage-plugin-pat/src/components/PATList.tsx`
  — 66 lines, simple table; superseded by existing service-token table view.
- `/Volumes/ADD_Dock/src/backstage-pat-plugin/backstage-plugin-pat/src/components/PATSettingsPage.tsx`
  — 74 lines, basic page wiring; superseded by existing service-token page.
- `/Volumes/ADD_Dock/src/primedx/backstage-access-tokens-plugin/packages/plugin-access-tokens/src/components/`
  — existing component set (table view, filters, dialogs) to model on.

**Confidence**: high — direct code reading and comparison.

---

## Synthesis: architectural picture for the spec

Pulling R1–R8 together, the design space for "user-self-service tokens that
authenticate as the user" narrows to one viable pattern, with one remaining
gap to close before the spec is fully grounded.

**What is settled**:

- A plugin cannot mint user JWTs directly (R3). `TokenFactory` is internal.
- The only way to obtain a user-principal credential is to go through
  Backstage's standard OAuth + refresh-token flow, which is exactly what MCP
  does (R1, R2).
- Refresh tokens are 30-day default, can survive up to 1 year via rotation,
  capped at 20 per user, hashed at rest, revocable. They are a usable
  PAT-equivalent (R2, R5).
- The existing `backstage-access-tokens-plugin` codebase has clean seams to
  add a parallel "user token" code path without disturbing service tokens
  (R7), and a single UX pattern from the abandoned PAT plugin (show-once
  dialog) is worth porting verbatim (R8).
- Refresh-token usage emits no audit events by default; if we want an audit
  trail we have to add it ourselves (R6).

**The one viable architecture**: an **OAuth-orchestration plugin**. The user
clicks "Create Token" in a settings page; the plugin walks them through
Backstage's OAuth flow (using DCR or a pre-registered client) to mint a fresh
refresh token; the plugin captures the resulting token, displays it once with
the show-once dialog, and persists metadata (name, created_at, last_used_at,
maybe the auth-backend session ID) in its own table. External clients use
the refresh token by calling `/api/auth/{provider}/refresh` to exchange it
for a short-lived JWT.

**The remaining gap**: whether DCR's OAuth flow exposes the refresh token in
a form our plugin (or the user's browser tab) can capture. If RFC 6749
`/token` returns it in the JSON response body, capture is trivial. If
auth-backend wraps refresh tokens in cookies even under DCR, the UX becomes
much harder — possibly requiring the user to extract it manually from
browser dev tools.

## Open questions surfaced by research

These are gaps the spec must close before implementation begins. Each one
maps to a specific follow-up read or a design decision.

**Q-R4-a — Refresh-token wire shape under DCR. RESOLVED.** With
`auth.experimentalDynamicClientRegistration.enabled: true`, Backstage exposes
an RFC 6749-compliant `/v1/token` endpoint that returns the refresh token in
the JSON response body, not via cookies. Both the authorization-code grant
response and the refresh-token grant response include `refresh_token` as a
plain JSON field. There is no cookie-based fallback in the token endpoint.

Sources:
- `plugins/auth-backend/src/service/OidcRouter.ts:440-455` — authorization-code
  response shape `{ access_token, token_type, expires_in, id_token, scope,
  refresh_token? }`.
- `plugins/auth-backend/src/service/OidcRouter.ts:457-495` — refresh-token
  grant response shape `{ access_token, token_type, expires_in,
  refresh_token }`.
- `plugins/auth-backend/src/service/OidcRouter.ts:515-545` — DCR registration
  endpoint creates clients with scopes `openid offline_access` and
  `grant_types: ['authorization_code']`.

**Spec implication**: the plugin can capture the refresh token from the
`/v1/token` JSON response immediately after the authorization-code exchange.
This makes the OAuth-orchestration UX feasible: send the user through the
consent route, receive the callback code, exchange the code for tokens, and
show the refresh token once.

**Q-R5-a — Public plugin API for managing refresh tokens. RESOLVED with
implications.** Backstage exposes **one** revocation surface to external
callers: the RFC 7009-compliant `/v1/revoke` endpoint on the OIDC router
(active when `experimentalDynamicClientRegistration.enabled` is true). It
requires the **raw refresh token** plus the OAuth client credentials
(`client_id`/`client_secret`).

Specifically:

- `/v1/revoke` accepts body `{ token, token_type_hint?, client_id?,
  client_secret? }`. The handler calls `this.oidc.revokeRefreshToken(token)`
  and always returns 200 (per RFC 7009).
- No session-id-based revocation API exists in the OIDC router or anywhere
  else in `@backstage/plugin-auth-node`.
- No public service ref exposes `OfflineAccessService`.
- `/api/auth/:provider/logout` removes only the active cookie session — it
  is not a per-token revocation API for arbitrary stored sessions.

**Spec implication (LOAD-BEARING)**: The architecture document's
[§3.2 revocation Path A / Path B / Path C analysis](user-tokens-architecture.md#32-revocation-mechanism-path-b-post-spike)
needs to be revised. Path A (direct service-ref consumption) is **not
viable** — no such ref exists. Path B (HTTP self-call) **is** viable, but
requires the plugin to possess the raw refresh token at revocation time,
which conflicts with the spec's §4 threat-model assertion that "the plugin's
DB does not store the refresh token — not even hashed." The two statements
can no longer both be true.

Three options to resolve (user decision required):

1. **Store the refresh token** in the plugin DB (encrypted at rest using an
   operator-configured key, or hashed in a way that still lets us call
   `/v1/revoke` — which means we'd need to keep the raw value somewhere
   keyed by the row). Revocation works via Path B. Threat model §4 needs
   amendment.
2. **Defer user-initiated revocation to v2**. Plugin marks rows revoked in
   its own table but does not invalidate the refresh token. The token
   continues to work until natural expiry (up to 30 days by default).
   This is Path C, which the spec explicitly labels unacceptable for v1.
3. **Upstream a session-id revocation feature to Backstage**. Out of scope
   for this implementation.

Reasonable hybrid: option 1 with encryption-at-rest, scoped narrowly. The
plugin already stores `service_access_tokens.token_hash` (the existing capability
already trusts the plugin DB with token-derived material), so the marginal
trust delta is small.

**Q-R6-a — Audit story.** Should the plugin wrap the standard `/refresh`
call (so every refresh of a plugin-issued token emits an audit event) or is
log-line observability sufficient for v1? Design decision, not a research
question — needs your input.

**Q-design-1 — Token presentation.** Do we present the raw refresh token to
the user, or wrap it in a friendly identifier (e.g., `bsut_<id>.<token>`) that
the plugin recognizes server-side? Wrapping helps with rate-limiting and
auditing but adds a translation layer at every `/refresh` call. Design
decision.

**Q-design-2 — Permission gate.** Decision is locked open by user: any
authenticated user can mint their own tokens. But should there be an
operator-configurable per-user cap distinct from auth-backend's
`maxTokensPerUser: 20`? Design decision.

---

## Phase 4 verification readiness (post-implementation research)

Three additional research items investigated before the harness E2E
verification. Each resolved against upstream Backstage source.

**R4-V1 — How an integration exchanges a refresh token for a JWT.**
Resolved: Backstage's `/v1/token` endpoint accepts `grant_type=refresh_token`
**without client credentials**. From
`plugins/auth-backend/src/service/OidcRouter.ts:368–381`:

> ```ts
> const hasCredentials = req.headers.authorization?.match(...) || (bodyClientId && bodyClientSecret);
> let authenticatedClientId: string | undefined;
> if (hasCredentials) { /* authenticate */ }
> const result = await this.oidc.refreshAccessToken({
>   refreshToken,
>   clientId: authenticatedClientId,   // optional
> });
> ```

Client authentication is **conditional**. The refresh-token grant
succeeds with just the refresh token. Concretely any HTTP client can do:

```bash
JWT=$(curl -s -X POST $BACKSTAGE/v1/token \
  -d "grant_type=refresh_token&refresh_token=$RT" | jq -r .access_token)
curl $BACKSTAGE/api/catalog/entities -H "Authorization: Bearer $JWT"
```

No `client_id` or `client_secret` need leave the plugin's backend.
US-2 in the overview spec can stay as described — the plugin gives
the user the raw refresh token; nothing more.

**Ancillary**: Backstage's DCR registration schema does not validate
`token_endpoint_auth_method`. Our plugin sends `client_secret_post`
but the value is silently ignored. Behavior is correct regardless.

**R4-V2 — Guest provider + DCR compatibility.** Inconclusive from
source. Defer to a smoke step in the harness: sign in as guest →
attempt `GET /v1/authorize?...` and observe whether Backstage either
redirects to consent or rejects. Captured as a procedure step in
`docs/spec/user-tokens-verification.md`.

**R4-V3 — OIDC discovery path. Bug found.** Backstage publishes the
discovery document at `/.well-known/openid-configuration` (OIDC
Discovery 1.0), **not** at `/.well-known/oauth-authorization-server`
(RFC 8414). `OidcService.getConfiguration()` source confirms:

> ```ts
> ...(dcrEnabled && {
>   registration_endpoint: `${this.baseUrl}/v1/register`,
>   revocation_endpoint: `${this.baseUrl}/v1/revoke`,
> })
> ```

The OIDC discovery doc DOES include `registration_endpoint` and
`revocation_endpoint` when DCR is enabled, so a one-line URL change
in the plugin orchestrator resolves it. Fixed in
[commit 07bdbed](https://github.com/PrimeDX/backstage-access-tokens-plugin/commit/07bdbed)
on `feat/user-tokens`.

---

## Phase 4 verification results

Executed on 2026-05-19 against the in-repo `e2e/harness/` running
Backstage **1.49.1**, plugin code at branch `feat/user-tokens`
(unit suite: 199/199 passing across the workspace).

### Setup additions applied to the harness

- `e2e/harness/app-config.yaml`:
  - `auth.experimentalDynamicClientRegistration.enabled: true`
  - `auth.experimentalRefreshToken.enabled: true`
  - `accessTokens.personal.encryptionKey: <local 32-byte base64>`
- `e2e/harness/packages/backend/src/accessTokensPermissionPolicyModule.ts`
  amended to ALLOW the `access-tokens:user:{read,write,revoke}` permissions
  for the calling user.
- `e2e/harness/packages/app/src/App.tsx` adds
  `personalAccessTokensAuthPlugin` from `@primedx/plugin-access-tokens` to the
  `features` array so the `/oauth2/authorize/:sessionId` consent route
  is registered with the personal-token consent copy.

### Results — primary user stories

| Story | Result | Evidence |
|---|---|---|
| **US-1** Mint a token | **PASS** | UI navigation lands at `/oauth2/authorize/<sessionId>` in same tab; approving the consent page returns to `/settings/personal-tokens#personal-access-tokens-mint=…`; the show-once dialog opens automatically and renders the raw `<sessionId>.<random>` refresh token. |
| **US-2** Use token from an integration | **PASS** | `POST /api/auth/v1/token` with `grant_type=refresh_token` and the raw token returned a 495-character JWT with `sub: user:development/guest` and `ent: [user:development/guest, group:development/platform]`. `GET /api/auth/v1/userinfo` with that JWT returned the same claims. `GET /api/catalog/entities` with that JWT returned **HTTP 200** with real catalog data — proving the request is treated as a user principal end-to-end. |
| **US-3** List my tokens | **PASS** | The token from US-1 appeared in the page table with correct name, created/expires timestamps, prefix, and `active` status. The raw refresh token was not present anywhere on the listing. |
| **US-4** Revoke a token | **PASS** | UI revoke transitioned the row to `revoked`. The previously-working refresh-grant from US-2 then returned **HTTP 400 `invalid_grant: "Invalid refresh token"`**, proving auth-backend's `OfflineAccessService` invalidated the underlying session (not just our local row). |

### Defects fixed during verification (committed to this branch)

- Backstage's OIDC discovery doc is at `/api/auth/.well-known/openid-configuration`,
  not at the origin root; orchestrator now uses the full plugin base
  URL.
- `auth.experimentalRefreshToken.enabled` is singular in Backstage;
  earlier docs and the config reader used the plural form, which the
  config loader silently ignored. Bulk-renamed.
- The OAuth callback route must be marked `unauthenticated` at the
  framework's `httpRouter.addAuthPolicy` because the redirect from
  Backstage's `/v1/authorize` does not always carry the user's
  session cookie cleanly across ports — the single-use `state`
  parameter is the credential.
- The mint popup was abandoned in favor of a same-tab redirect-with-
  fragment after the inline-script `<script>` was found to be
  dropped by Backstage's default CSP. See architecture spec §2.3.
- Frontend dialogs imported `Alert` from `@material-ui/core`, where
  v4 does not export it; moved to `@material-ui/lab`.

### Deferred checks (recorded for tracking)

- **US-5 (automatic expiry)** — DEFERRED with rationale. Mechanism
  is auth-backend's `OfflineAccessService` rejecting refresh tokens
  past `tokenLifetime`, which is the same code path that already
  rejected the revoked token in US-4 (both return
  `invalid_grant` from `/v1/token`). Running a timed test against a
  short `tokenLifetime` config would prove auth-backend works, not
  our plugin. Acceptable to ship without the explicit timed run.
- **Negative 3.1 (cross-user isolation)** — DEFERRED. Not
  executable in the harness today (single guest user); a follow-up
  PR that adds a second auth provider can verify this. The
  server-side scoping is unit-tested in
  `userTokensRouter.test.js` ("GET /personal/:id returns 404
  for another user's id" and "GET /personal lists only the
  caller's tokens").
- **Negative 3.2 (encryption-key mismatch)** — DEFERRED with
  rationale. The AES-256-GCM wrong-key rejection is covered by the
  `userTokensEncryption.test.js` test "encrypt with different keys
  yields different ciphertexts and decrypt fails with wrong key";
  the router's catch path that turns that throw into a 502 is
  reviewable in `userTokensRouter.js`. A live key-swap drill is
  belt-and-suspenders, valuable but not blocking the v1 PR.

### Conclusion

The four functional user stories pass against a live Backstage
1.49.1 runtime. The branch meets the "ready for PR" gate stated in
`docs/spec/user-tokens-verification.md` §4 (US-1, US-2, US-3, and
US-4 PASS). Remaining items (US-5 + the two negative checks) are
tracked in Phase F of the plan and are not blocking the v1 PR.
