# Spec — User Personal Access Tokens (API & Schema)

**Status**: Draft — Phase 2 of Spec-Driven Development plan
**Companion documents**: [overview](./user-tokens-overview.md),
[architecture](./user-tokens-architecture.md), [research](../research-notes.md).
**Scope**: HTTP API contract, DB schema, public TypeScript exports, and
`app-config.yaml` surface for the user-token capability.

This document is the wire-level contract. Implementation details (which
service factories, how the OAuth orchestration plugs in) live in
[architecture](./user-tokens-architecture.md). Motivation lives in
[overview](./user-tokens-overview.md).

## 1. HTTP API

All endpoints are mounted under the `access-tokens` plugin's HTTP
router at the plugin-id-derived prefix. Personal-access-token routes are
namespaced under `/personal`, while service-token routes are namespaced
under `/service`.

Full path examples assume Backstage's standard `/api/<plugin-id>` prefix:
`POST /api/access-tokens/personal`.

All routes require an authenticated browser session via the existing
`httpRouter.addAuthPolicy({ allow: 'user-cookie' })` mechanism (per R7).
Cross-session calls (e.g., from external integrations) are not supported for the
management API — integrations authenticate to the data plane via
`/api/auth/v1/token`, not via this management API.

### 1.1 — `POST /personal/mint` — initiate mint flow

Starts an OAuth authorization-code flow. Returns a redirect URL that the
frontend navigates to in the same browser tab to complete consent.

Request body:

```json
{
  "name": "string, 1..100 chars, required, unique per user",
  "expiresAt": "ISO 8601 timestamp, optional, must be in the future,
                must not exceed (now + maxRotationLifetime)"
}
```

Response 200:

```json
{
  "flowId": "uuid",
  "authorizeUrl": "https://<backstage>/api/auth/oidc/v1/authorize?...",
  "state": "opaque-string-bound-to-this-mint-attempt"
}
```

Error responses:

- `400` — name missing, too long, or duplicate for this user; expiry invalid
  or beyond `maxRotationLifetime`.
- `401` — caller is not a user principal.

### 1.2 — `GET /personal/mint/callback` — OAuth callback

Backstage's auth-backend redirects to this URL with `code` and `state` query
parameters after the user consents. The plugin exchanges `code` for tokens
at `/v1/token`, captures the `refresh_token`, persists metadata, and redirects
back to the settings page with a one-time URL fragment carrying the token.
The frontend clears the fragment client-side immediately after reading it.

Request query parameters: `code`, `state` (must match a row in the in-flight
mint-flow store).

Success response: `302 Found` to:

```text
<app.baseUrl>/settings/personal-tokens#personal-access-tokens-mint=<base64url-json-payload>
```

Decoded success payload:

```json
{
  "type": "personal-access-tokens-mint-result",
  "flowId": "<uuid>",
  "token": "<raw refresh_token>",
  "metadata": {
    "id": "<uuid>",
    "name": "my-ci-token",
    "createdAt": "2026-05-19T12:00:00.000Z",
    "expiresAt": "2026-06-18T12:00:00.000Z",
    "prefix": "first-8-chars"
  }
}
```

Error responses:

- `302` to
  `<app.baseUrl>/settings/personal-tokens#personal-access-tokens-mint-error=<base64url-json-payload>`
  when `state` does not match any in-flight flow, the OAuth provider returns
  an error, or `/v1/token` exchange fails.

The frontend reads the fragment payload and then renders the one-time-show
dialog.

**Security note**: the raw token never persists to the plugin's own DB.
It is transmitted to the frontend via a same-tab URL fragment exactly once
and then discarded server-side. The plugin clears the fragment via
`history.replaceState` after reading it. The plugin's table only stores
metadata. See
[architecture §4](./user-tokens-architecture.md#threat-model) for the
threat model.

### 1.3 — `GET /personal` — list my tokens

Returns the calling user's tokens, ordered by `createdAt` descending.

Response 200:

```json
{
  "tokens": [
    {
      "id": "uuid",
      "name": "my-ci-token",
      "createdAt": "2026-05-19T12:00:00.000Z",
      "expiresAt": "2026-06-18T12:00:00.000Z",
      "lastUsedAt": "2026-05-20T09:14:00.000Z" | null,
      "prefix": "first-8-chars",
      "revokedAt": null
    }
  ]
}
```

Error responses:

- `401` — caller is not a user principal.

### 1.4 — `GET /personal/:id` — get one token

Returns one row, scoped to the calling user. Same shape as the `tokens[]`
entry above. Returns `404` if the id does not exist or belongs to another
user (do not distinguish — privacy invariant).

### 1.5 — `DELETE /personal/:id` — revoke

Revokes a token. Issues the revocation against `OfflineAccessService` via
whatever auth-backend mechanism is accessible to the plugin (architecture
will pin the exact API; see [Q-R5-a residual](./user-tokens-architecture.md#q-r5-a-residual)),
then marks the metadata row as revoked.

Response: `204 No Content`.

Error responses:

- `404` — token id does not exist or belongs to another user.
- `502` — auth-backend revocation failed; the metadata row is **not**
  marked revoked, and the caller may retry. Body includes the underlying
  error.

### 1.6 — `GET /personal/:id/audit` — token audit log

Returns audit events for one of the calling user's tokens (creation,
revocation, listing). Returns `404` if the token id does not exist or
belongs to another user.

Response 200:

```json
{
  "events": [
    {
      "id": "uuid",
      "event": "MINTED | REVOKED | METADATA_VIEWED",
      "actor": "user:default/alice",
      "occurredAt": "2026-05-19T12:00:00.000Z",
      "metadata": { ... event-specific JSON ... }
    }
  ]
}
```

### 1.7 — non-goals for the API

- Bulk create (one token per request)
- Token rename (immutable)
- Expiry extension (revoke + mint)
- Cross-user list (`?userEntityRef=...`) — privacy invariant prevents it

## 2. Database schema

Two new tables in the plugin's existing database, alongside the existing
`service_access_tokens` and `service_access_token_audit_log` tables. Migrations are
additive only — no changes to existing tables.

### 2.1 — `personal_access_tokens`

```sql
CREATE TABLE personal_access_tokens (
  id                       varchar(36)  PRIMARY KEY,
  name                     varchar(100) NOT NULL,
  user_entity_ref          varchar(255) NOT NULL,
  prefix                   varchar(16)  NOT NULL,
  session_id               varchar(64)  NOT NULL,
  -- session_id is the auth-backend OfflineAccessService session identifier
  -- (the `<sessionId>` prefix of a `<sessionId>.<randomBytes>` refresh token).
  -- Used for UI / lookups; alone it cannot authenticate.
  encrypted_token          bytea        NULL,
  encrypted_token_iv       bytea        NULL,
  encrypted_token_tag      bytea        NULL,
  -- AES-256-GCM ciphertext + IV + auth tag of the raw refresh token,
  -- needed at revocation time to call `/v1/revoke` (RFC 7009).
  -- NULL once the token has been revoked or the row is otherwise
  -- considered terminal — the encrypted material is wiped post-revocation.
  created_at               timestamp    NOT NULL,
  expires_at               timestamp    NOT NULL,
  last_used_at             timestamp    NULL,
  revoked_at               timestamp    NULL,
  UNIQUE (user_entity_ref, name),
  INDEX idx_personal_access_tokens_user (user_entity_ref),
  INDEX idx_personal_access_tokens_session (session_id),
  INDEX idx_personal_access_tokens_expires (expires_at)
);
```

Field notes:

- `prefix`: first ~8 characters of the raw refresh token (the part before
  the `.` separator, per R4). Used purely for visual identification in the
  UI. Not a security-meaningful artifact.
- `session_id`: opaque identifier from auth-backend's
  `OfflineAccessService`. Used for the UI list and to bind a metadata row
  to a single underlying refresh-token session.
- `encrypted_token` / `encrypted_token_iv` / `encrypted_token_tag`: the
  AES-256-GCM ciphertext of the raw refresh token, plus its 12-byte IV
  and 16-byte authentication tag. The encryption key is
  `accessTokens.personal.encryptionKey` (32 raw bytes, base64-encoded
  in `app-config.yaml`). The plugin **refuses to mount** if the key is
  missing or not 32 bytes after decoding. Once a token is revoked
  successfully, the three columns are set to NULL so the ciphertext is
  not retained beyond its usefulness.

### 2.2 — `personal_access_token_audit_log`

```sql
CREATE TABLE personal_access_token_audit_log (
  id           varchar(36)  PRIMARY KEY,
  token_id     varchar(36)  NOT NULL REFERENCES personal_access_tokens(id),
  event        varchar(50)  NOT NULL,
  actor        varchar(255) NULL,
  metadata     text         NULL,
  occurred_at  timestamp    NOT NULL,
  INDEX idx_user_audit_token (token_id),
  INDEX idx_user_audit_occurred (occurred_at)
);
```

Same shape as the existing `service_access_token_audit_log` for consistency.

### 2.3 — Migrations

Single Knex migration `add_personal_access_tokens_tables` in
`packages/plugin-access-tokens-backend/src/migrations.js`, applied via the
existing `applyServiceTokenMigrations` entry point. Migration is idempotent
(`hasTable` check before create).

## 3. Public TypeScript exports

### 3.1 — `@primedx/plugin-access-tokens-node`

```ts
import {
  createPermission,
  PermissionAction,
} from '@backstage/plugin-permission-common';

export const personalAccessTokensReadPermission = createPermission({ ... });
export const personalAccessTokensWritePermission = createPermission({ ... });
export const personalAccessTokensRevokePermission = createPermission({ ... });
export const personalAccessTokensPermissions = [
  personalAccessTokensReadPermission,
  personalAccessTokensWritePermission,
  personalAccessTokensRevokePermission,
] as const;
```

No new auth-handler module is exported. Tokens authenticate via
auth-backend's native pipeline, not via the existing
`serviceAccessTokenHandlerModule`.

### 3.2 — `@primedx/plugin-access-tokens-backend`

New exports alongside existing service-token exports:

```ts
export { userTokensRouter };   // for tests / advanced wiring; not required for default use
```

`accessTokensPlugin` is amended internally to register the user-tokens
router and the new permissions; no new top-level plugin is exposed.

### 3.3 — `@primedx/plugin-access-tokens`

New user-settings sub-page registered under Backstage's
`page:user-settings` extension point:

```ts
const userTokensPage = SubPageBlueprint.make({
  attachTo: { id: 'page:user-settings', input: 'pages' },
  params: {
    path: 'personal-tokens',
    routeRef: personalAccessTokensRouteRef,
    title: 'Personal Access Tokens',
    loader: () => import('./UserTokensPage.jsx')
      .then(m => React.createElement(m.UserTokensSettingsTab)),
  },
});
```

Plus:

```ts
export { personalAccessTokensRouteRef };  // for app-side route binding
```

The default-exported plugin's `extensions` array includes the admin
`serviceTokensPage`, the admin `serviceTokensNavItem`, and the
user-settings `userTokensPage`.

## 4. Configuration surface (`app-config.yaml`)

The plugin reads three new optional keys. All defaults are chosen so that
"enable the experimental flags and add the plugin" works without any
plugin-specific config.

```yaml
accessTokens:
  personal:
    enabled: true                   # default true if the plugin's frontend is wired
    defaultExpiryDays: 30           # default expiry shown in the mint dialog
    maxExpiryDays: 365              # cap (must be ≤ auth-backend maxRotationLifetime)
    encryptionKey: '<base64 of 32 raw bytes>'
    # REQUIRED. AES-256-GCM key used to encrypt refresh tokens at rest in
    # the plugin DB so they can be presented to RFC 7009 /v1/revoke at
    # revocation time. Generate with:
    #   openssl rand -base64 32
    # Treat as a secret. Loss prevents revocation of in-flight tokens.
    # Rotation is out of scope for v1.
    dcrClient:
      # If absent, the plugin registers itself dynamically via DCR on first mint.
      # If provided, the plugin uses this pre-registered client instead.
      clientId: '<opaque>'
      clientSecret: '<opaque>'
      redirectUri: '<must match the plugin's callback URL>'
```

In addition the plugin requires the operator to have set:

```yaml
auth:
  experimentalDynamicClientRegistration:
    enabled: true
  experimentalRefreshToken:
    enabled: true
    # tokenLifetime, maxRotationLifetime, maxTokensPerUser left at defaults
    # unless the operator chooses otherwise
```

The plugin's `init()` logs a clear error and refuses to mount the
personal-access-token router if either flag is unset.

## 5. Verification — what proves this spec is satisfied

**Unit-level** (delivered):

1. **API contract tests**: each endpoint above receives both happy-path
   and each documented error case, asserting status code and response
   shape.
2. **DB migration tests**: tables exist, indexes exist, idempotency
   verified via repeat application.
3. **Cross-user isolation**: a token belonging to user A is invisible
   to user B for `GET`, `DELETE`, and `audit`.
4. **Config-validation tests**: refusal to mount when either
   experimental flag is unset; clean error message.

All four landed via the unit test suite — see `userTokensRouter.test.js`,
`migrations.test.js`, `userTokensDatabase.test.js`,
`userTokensConfig.test.js`.

**End-to-end** (executed against `e2e/harness/`): the master procedure
lives in [`docs/spec/user-tokens-verification.md`](./user-tokens-verification.md).
The pass criteria for the v1 release are summarized there with binary
yes/no outcomes per user story.

In short: bring up the harness with the experimental flags + the
encryption key, mint a token in the UI, then run the two-curl
sequence from [overview US-2](./user-tokens-overview.md#us-2--use-a-token-from-an-integration)
and confirm 200 against a probe endpoint that returns the calling
user's `userEntityRef`. Revoke the token from the UI; the same
sequence then returns 401 from `/v1/token`.
