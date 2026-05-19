# Spec — User Personal Access Tokens (Overview)

**Status**: Draft — Phase 2 of Spec-Driven Development plan
**Scope**: Add a user-token capability to this plugin family alongside the
existing service-token capability.
**Source of architectural facts**: [`../research-notes.md`](../research-notes.md).

## Problem statement

> Backstage users need to create and manage long-lived tokens so they can
> build their own apps and scripts that call the Backstage API on their
> behalf, authenticating as themselves and being subject to their own
> permissions and ownership claims.

Today this is not possible self-service. The platform supports two adjacent
patterns:

- **Service tokens** (delivered by this plugin) — admin-managed, group-scoped,
  service principals. Suitable for system-to-system integrations but does not
  represent any individual user.
- **OAuth + refresh tokens** (delivered natively by `@backstage/plugin-auth-backend`
  with `experimentalDynamicClientRegistration` and `experimentalRefreshTokens`)
  — produces user-principal credentials, but the UX is "configure an OAuth
  client and complete the dance from a browser." There is no friendly path
  for a user to mint, copy, label, and later revoke a long-lived credential.

This spec defines a thin user-facing capability that bridges the gap: a
settings page where users mint a personal access token in three clicks,
display the token once with the show-once warning, paste it into a script,
and revoke it later. The underlying credential **is** a Backstage refresh
token issued through the standard OAuth + DCR pipeline; the plugin contributes
UX, metadata storage, and revocation orchestration around it.

## User stories

Each story has explicit acceptance criteria so the spec is verifiable.

### US-1 — Mint a token

> As an authenticated Backstage user, I can mint a new personal access token
> in the settings page so that I can use it from my own apps.

Acceptance:

- An authenticated user navigates to `/settings/personal-tokens` and sees a
  "Create token" affordance.
- Clicking it opens a dialog that requests a human-readable name (required)
  and optional expiry (defaulting to 30 days, capped at 1 year per
  Backstage's `maxRotationLifetime`).
- Submitting initiates an OAuth authorization-code flow against
  `/v1/authorize` using a plugin-registered DCR client. The flow proceeds in
  a popup or redirect; the user may have to re-confirm consent.
- On success the plugin captures the `refresh_token` from the `/v1/token`
  JSON response, persists metadata (name, created_at, expiry, masked prefix,
  optional last_used_at) in its own table, and renders the raw token once
  inside a show-once dialog with a copy-to-clipboard button and a clear
  warning.
- Closing the dialog removes the token from the UI permanently.

### US-2 — Use a token from a script

> As an authenticated Backstage user, I can use a personal access token I
> previously minted to call any Backstage backend API as myself.

Acceptance criteria (concrete; resolved via Phase 4 research R4-V1):

The user's script needs **only the raw `refresh_token`**. It exchanges
the refresh token for a short-lived JWT at Backstage's RFC 6749
`/v1/token` endpoint (which DCR enables) and uses the JWT as a bearer:

```bash
# Step 1 — exchange refresh token for a JWT. No client credentials required.
JWT=$(curl -s -X POST "$BACKSTAGE_BASE_URL/v1/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=refresh_token&refresh_token=$REFRESH" \
  | jq -r .access_token)

# Step 2 — call any Backstage backend API as the user
curl -H "Authorization: Bearer $JWT" \
  "$BACKSTAGE_BASE_URL/api/catalog/entities" \
  | jq length
```

The pass criteria are:

- Step 1 returns 200 with a JSON body containing a non-empty
  `access_token`.
- Step 2 returns 200, not 401.
- The response is filtered by the user's ownership / permissions —
  i.e., a probe endpoint (the verification spec includes one) returns
  the calling user's `userEntityRef`, proving the framework treats the
  request as a user principal, not a service principal.

The script does **not** need `client_id`, `client_secret`, or PKCE
verifier. Backstage's `/v1/token` accepts the refresh-token grant
without client credentials; the plugin holds those credentials only
for the authorization-code half of the dance, which the user does
once during mint via the browser popup.

### US-3 — List my tokens

> As an authenticated Backstage user, I can see the personal access tokens I
> have minted so I can track and manage them.

Acceptance:

- `/settings/personal-tokens` shows a table of tokens belonging only to the
  current user, with columns: name, created at, expires at, last used at
  (best-effort), masked prefix.
- Tokens belonging to other users are never returned by the API — the
  backend filters by `request.userEntityRef`.
- Revoked or expired tokens are visually distinguished from active ones.

### US-4 — Revoke a token

> As an authenticated Backstage user, I can revoke a personal access token
> so it stops working.

Acceptance:

- A revoke action on each row triggers a confirmation dialog. Confirming
  invalidates the refresh token (the plugin invokes auth-backend's
  revocation API — see [API spec §revocation](./user-tokens-api.md#revocation)).
- The revoked token can no longer be exchanged for a JWT at the next
  `/refresh` call.
- The token remains visible in the user's list (marked revoked) for
  audit/UX purposes; it is not silently deleted.

### US-5 — Tokens expire automatically

> As an authenticated Backstage user, I do not need to manually revoke
> tokens that have passed their expiry; the system enforces it.

Acceptance:

- Refresh-token expiry is enforced by Backstage's auth-backend
  (`OfflineAccessService` rejects expired tokens). The plugin does not need
  to reimplement this.
- The plugin's table reflects the user-specified expiry; expired rows are
  rendered as expired in the UI.

## Non-goals

1. **Not a service-token replacement.** The existing service-token capability
   stays. User tokens are an additional, complementary feature with a
   different audience and a different principal type.
2. **Not a generic OAuth client.** The plugin orchestrates Backstage's
   built-in OAuth provider; it does not allow users to register arbitrary
   OAuth applications, configure custom scopes, or proxy third-party
   identity providers.
3. **Not a token-wrapping bearer.** The user receives the raw refresh token,
   not a plugin-wrapped envelope. The plugin is a UX shim, not a man-in-
   the-middle for `/refresh` (see [Architecture §1](./user-tokens-architecture.md)
   for rationale).
4. **Not a permission-system change.** Tokens authenticate as the user; any
   permission policy that already governs the user applies unchanged. No
   new "scopes" beyond what Backstage's OAuth flow already supports.
5. **Not a key-management system.** The plugin does not sign anything itself
   and does not store any cryptographic secret other than the refresh token's
   metadata; the actual hashing happens in auth-backend's
   `OfflineAccessService`.

## Chosen mechanism (justified)

The plugin **orchestrates** Backstage's existing OAuth-with-DCR pipeline. It
does not invent a new credential type, does not register an
`externalTokenHandlersServiceRef` (that would yield a service principal, not
a user principal — see R3), and does not embed any signing infrastructure.

Concretely:

- A DCR-registered plugin-owned OAuth client mints refresh tokens through
  `/v1/authorize` → `/v1/token` (RFC 6749 / RFC 7591 compliant) — confirmed
  in [research-notes Q-R4-a](../research-notes.md#open-questions-surfaced-by-research).
- The plugin maintains a metadata table (`user_tokens`) for the UX (name,
  expiry, prefix, last used). The actual token validity and rotation live in
  `OfflineSessionDatabase` owned by `@backstage/plugin-auth-backend`
  (research R5).
- Revocation is delegated to auth-backend. (See [Architecture §3](./user-tokens-architecture.md#revocation)
  for the precise mechanism, including the residual-risk note on
  Q-R5-a.)

This design **cannot** be replaced by a plugin-internal token format because
R3 establishes that `TokenFactory` is not accessible to plugins. The chosen
mechanism is the only architecturally sound path to user-principal credentials
in current Backstage.

## High-level flows (sequence diagrams)

### Mint

```
User      Browser/Frontend       Plugin Backend       auth-backend       OfflineSessionDB
  |              |                       |                  |                  |
  | click "Create token"                 |                  |                  |
  |------------> |                       |                  |                  |
  |              | POST /api/user-tokens (name, expiry)     |                  |
  |              |---------------------> |                  |                  |
  |              |                       | start OAuth (DCR client)            |
  |              |                       |----------------> |                  |
  |              |                       |                  | issue auth code  |
  |              |                       |                  |                  |
  |              |                       | exchange code at /v1/token          |
  |              |                       |----------------> | rotate, persist  |
  |              |                       |                  |----------------> |
  |              |                       |                  | <- refresh_token |
  |              |                       | <- access+refresh_token (JSON body) |
  |              |                       | insert row in user_tokens metadata  |
  |              | <- token (one-time) + metadata           |                  |
  | <- show-once dialog                   |                  |                  |
  | copy token   |                       |                  |                  |
```

### Use

```
Script              auth-backend                      Catalog (or any plugin)
  | POST /api/auth/{provider}/refresh                       |
  | Authorization-style refresh-token                       |
  |----------------> | validate, rotate, issue JWT          |
  | <- BackstageSignInResult (JWT)                          |
  |                  |                                      |
  | GET /api/catalog/entities                               |
  | Authorization: Bearer <JWT>                             |
  |--------------------------------------------------------> | httpAuth.credentials(...)
  | <- entities filtered by ownership                       | -> user principal
```

### Revoke

```
User -> Plugin: click "Revoke" on a row
Plugin -> Plugin DB: mark metadata row revoked
Plugin -> auth-backend: invoke OfflineAccessService revocation by session id
auth-backend -> DB: hash invalidated; next /refresh fails
```

(See [Architecture §3 — Revocation](./user-tokens-architecture.md#revocation)
for the exact API call, including the open question Q-R5-a residual risk.)

## Open design decisions (resolved here)

The following two design questions were left open by Phase 1 research; both
are resolved in this overview and inherited by the other two spec documents.

### Q-R6-a — Audit story for v1

**Decision**: For v1, audit only the plugin-owned actions (mint, revoke,
list). Do NOT wrap `/api/auth/{provider}/refresh` calls. Refresh usage is
observable via auth-backend log lines, which is sufficient as a starting
point.

**Rationale**: Wrapping `/refresh` would require the plugin to be a
mandatory proxy for every JWT exchange. That adds latency, a new failure
surface, and a permissions question (the wrapper would need to know how to
call auth-backend on the user's behalf). Per the existing service-token
plugin, an audit table for plugin-owned actions is the established pattern
(R7) — we follow it for consistency, defer the deeper instrumentation until
a concrete need surfaces.

### Q-design-1 — Raw vs. wrapped token

**Decision**: Present the raw refresh token to the user. Do not wrap it in a
plugin-specific envelope.

**Rationale**: A wrapped envelope would require the plugin to proxy every
`/refresh` call (to unwrap before forwarding), introducing the same drawbacks
as the audit-wrapper above. The raw token works directly with
`/api/auth/{provider}/refresh` — same endpoint a browser uses — so the user's
script is portable across Backstage versions and doesn't depend on this
plugin remaining installed for it to work. Should we later want the wrapping
behavior, the metadata table already gives us a foreign key into a per-token
envelope without a v1 breaking change.

### Q-design-2 — Per-user cap

**Decision**: Defer to auth-backend's existing
`auth.experimentalRefreshTokens.maxTokensPerUser` (default 20). Do not
introduce a plugin-specific cap.

**Rationale**: A plugin-specific cap would only loosen what auth-backend
already enforces; tightening it requires only that operators lower the
existing config. Adding another knob doubles the surface area for no clear
benefit.

## Verification — how we will know this spec is satisfied

A v1 implementation is "done" when:

1. A logged-in user can mint, list, and revoke their own tokens via the
   plugin UI, end-to-end against a real Backstage instance with the two
   experimental flags enabled.
2. A bare `curl` script (no browser involved beyond mint) can use a minted
   refresh token to obtain a JWT and call `/api/catalog/entities`, receiving
   results filtered by the user's ownership claims (i.e., proving the
   request is treated as the user, not a service).
3. `httpAuth.credentials(req, { allow: ['user'] })` in a probe plugin
   returns the expected `userEntityRef` for a request authenticated with a
   minted-then-refreshed JWT.
4. Revoking a token from the UI causes the next `/refresh` for that token to
   fail.
5. The plugin's audit log records mint, list, and revoke actions for the
   acting user.

Phase 4 (implementation) will produce a `docs/testing.md` companion to this
overview.