# Architecture

Audience: contributors and advanced readers who need the internal design, not the install story.

This document describes the internal design of the access tokens plugin — how the three packages fit together, how a token is created and verified, and the key design decisions that shaped the implementation.

---

## Package overview

```
backstage-access-tokens-plugin/
├── packages/
│   ├── plugin-access-tokens/          # Frontend plugin
│   ├── plugin-access-tokens-backend/  # Backend plugin
│   └── plugin-access-tokens-node/     # Shared node library
```

The three packages have a strict dependency direction:

```
plugin-access-tokens          (frontend — no dependency on the other two)
plugin-access-tokens-backend  → plugin-access-tokens-node
plugin-access-tokens-node     (no internal dependencies)
```

The frontend plugin has no runtime dependency on the backend or node packages. It communicates with the backend exclusively through the REST API.

---

## `plugin-access-tokens-node` — Shared node library

This package contains everything that needs to be shared between the backend plugin and the auth handler, without creating a circular dependency.

**Key modules:**

| Module | Purpose |
|---|---|
| `primitives.js` | `sha256hex` — hashes a raw token for storage and lookup |
| `primitives.js` | `buildSubject` — constructs the principal subject string from a group entity ref |
| `verifyToken.js` | Core token verification logic — looks up the hash in the database, checks expiry and revocation status |
| `cache.js` | In-memory LRU-style cache keyed by token hash, with configurable TTL |
| `database.js` | Auth-scoped database adapter — read-only interface used during token verification |
| `serviceTokenHandler.js` | Wraps `verifyToken` in a Backstage `ExternalTokenHandler` |
| `module.js` | `serviceAccessTokenHandlerModule` — registers the handler as a Backstage service factory |
| `permission.js` | Exports three granular `ResourcePermission<'service-token'>` objects (`serviceAccessTokensReadPermission`, `serviceAccessTokensWritePermission`, `serviceAccessTokensRevokePermission`) and the `SERVICE_ACCESS_TOKEN_RESOURCE_TYPE` constant. Compatible with Backstage RBAC plugins. |
| `config.js` | Reads `accessTokens.service.cacheTtlSeconds` from root config |
| `constants.js` | `serviceTokenHandlerType = 'backstage-service-access-token'` |
| `resolveTokenScopes.js` | `createScopeResolver` — creates a function that reads token scopes from the verification cache |

---

## `plugin-access-tokens-backend` — Backend plugin

This package owns the REST API, the write-path database operations, and the permission enforcement middleware.

**Key modules:**

| Module | Purpose |
|---|---|
| `plugin.js` | `accessTokensPlugin` — Backstage backend plugin entry point; wires all services together |
| `expressRouter.js` | Express router — auth middleware + route handlers |
| `http.js` | Pure handler functions (`handleCreateToken`, `handleListTokens`, etc.) — no Express dependency |
| `database.js` | Knex-backed database adapter — full CRUD for tokens and audit log |
| `migrations.js` | Schema migrations — creates `service_access_tokens` and `service_access_token_audit_log` tables |
| `createToken.js` | Token creation logic — generates raw token, hashes it, validates input, writes to DB |
| `revokeToken.js` | Revocation logic — marks token revoked, writes audit event |
| `listTokens.js` | List/filter logic — computes `status` field from DB columns |
| `getToken.js` | Single token fetch |
| `auditLog.js` | Audit log fetch |
| `scopes.js` | Built-in scope catalogue + `getScopeCatalogue` merger |
| `config.js` | Reads backend-specific config keys |
| `entityRefs.js` | `normalizeGroupEntityRef` — validates and normalises group entity ref strings |
| `auth.js` | Thin wrapper around `httpAuth.credentials` |

---

## `plugin-access-tokens` — Frontend plugin

This package is a standard Backstage new-frontend-system plugin. It registers the admin service-token page at `/admin/access-tokens`, contributes a `Personal Access Tokens` tab to Backstage user settings at `/settings/personal-tokens`, and exports an optional consent-route feature for the user-token OAuth flow.

**Key modules:**

| Module | Purpose |
|---|---|
| `index.js` | Plugin entry point — `createFrontendPlugin` with `PageBlueprint` for admin service tokens, `NavItemBlueprint` for the admin sidebar item, and `SubPageBlueprint` for the user-settings PAT tab |
| `routes.js` | Route definitions for `/admin/access-tokens`, `/settings/personal-tokens`, and `/oauth2` consent routing |
| `ServiceTokensPage.jsx` | Top-level page component — owns all state and API calls |
| `components/ServiceTokensTableView.jsx` | Token list table — pure presentational |
| `components/ServiceTokensFilters.jsx` | Status + group filter bar — pure presentational |
| `components/CreateTokenDialog.jsx` | Create token form dialog — pure presentational |
| `components/RevokeDialog.jsx` | Revoke confirmation dialog — pure presentational |
| `components/AuditLogDialog.jsx` | Audit log dialog — pure presentational |
| `helpers.js` | Date formatting, status labels, form validation, group entity mapping |

All presentational components are pure — they receive data and callbacks as props and have no Backstage API hooks. This makes them fully testable in Storybook without a running Backstage instance.

---

## Token lifecycle

> **Important:** Token `scopes` in this plugin are metadata attached to tokens. They are not universally enforced across all Backstage backend routes by this plugin itself. Enforcement must be implemented by consuming plugins/policies if required.
>
> The core plugin remains intentionally minimal and non-opinionated: it provides lifecycle and identity primitives, while consumer plugins/policies own route-level authorization decisions.

### Creation

```
Admin user (browser)
  → POST /api/access-tokens/service
    → expressRouter: authenticate user, check access-tokens:service:write permission
    → handleCreateToken:
        1. Validate input (name, group, scopes, expiry)
        2. Verify group exists in catalog (via catalogServiceRef)
        3. Generate raw token (crypto.randomUUID-based, prefixed)
        4. Hash raw token with SHA-256
        5. Write token record to service_access_tokens table
        6. Write 'created' event to service_access_token_audit_log
        7. Return token record + rawToken (one time only)
```

The raw token is **never stored**. Only the SHA-256 hash is persisted. The prefix (first 12 characters) is stored separately to aid identification without exposing the full token.

### Verification (incoming API request with raw token)

```
External caller (CI, script)
  → GET /api/catalog/entities (or any backend route)
    → Backstage core.auth service
      → ExternalTokenHandlers.verify(token)
        → serviceTokenHandler.verifyToken(token):
            1. Hash the raw token with SHA-256
            2. Check in-memory cache (hit → return cached principal)
            3. Cache miss → query service_access_tokens table by hash
            4. Check: token exists, not revoked, not expired
            5. Cache the result for cacheTtlSeconds
            6. Return principal: { type: 'service', subject: 'service-token:group:default/platform:ci-pipeline' }
```

The principal type is `service` and the subject is `service-token:<groupEntityRef>:<tokenName>` (e.g. `service-token:group:default/platform:ci-pipeline`). This uniquely identifies both the owning group and the specific token. Downstream plugins see this as a service principal and can apply their own authorization logic.

### Revocation

```
Admin user (browser)
  → DELETE /api/access-tokens/service/:id
    → expressRouter: authenticate user, check access-tokens:service:revoke permission
    → handleRevokeToken:
        1. Look up token by ID
        2. Check token is not already revoked
        3. Set revoked_at, revoked_by on the token record
        4. Write 'revoked' event to service_access_token_audit_log
        5. Return 204 No Content

Next verification attempt with the revoked raw token:
  → Cache TTL expires (up to cacheTtlSeconds seconds)
  → DB lookup finds revoked_at is set
  → Returns 401 Unauthorized
```

---

## Database schema

### `service_access_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `name` | VARCHAR(100) NOT NULL | Unique within group (see constraint below) |
| `description` | TEXT NOT NULL | |
| `token_hash` | VARCHAR(64) NOT NULL UNIQUE | SHA-256 hex digest of the raw token |
| `token_prefix` | VARCHAR(12) NOT NULL | First 12 chars of the raw token (for display) |
| `group_entity_ref` | VARCHAR(255) NOT NULL | e.g. `group:default/platform` |
| `scopes` | TEXT NOT NULL | JSON-serialised string array |
| `created_by` | VARCHAR(255) NOT NULL | User entity ref |
| `created_at` | DATETIME NOT NULL | |
| `expires_at` | DATETIME NOT NULL | |
| `last_used_at` | DATETIME NULL | Reserved for future use |
| `revoked_at` | DATETIME NULL | Set on revocation |
| `revoked_by` | VARCHAR(255) NULL | User entity ref of revoker |

**Constraints and indexes:**

- `UNIQUE (group_entity_ref, name)` — token names are unique per group
- `INDEX (token_hash)` — fast lookup during verification
- `INDEX (group_entity_ref)` — fast filtering by group
- `INDEX (expires_at)` — fast expiry queries
- `INDEX (revoked_at)` — fast revocation status queries

### `service_access_token_audit_log`

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `token_id` | VARCHAR(36) NOT NULL FK → `service_access_tokens.id` | |
| `event` | VARCHAR(50) NOT NULL | `created` or `revoked` |
| `actor` | VARCHAR(255) NULL | User entity ref |
| `metadata` | TEXT NULL | JSON — stores revocation reason |
| `occurred_at` | DATETIME NOT NULL | |

**Indexes:**

- `INDEX (token_id)` — fast audit log fetch per token
- `INDEX (occurred_at)` — chronological ordering

---

## Auth handler wiring — why a service factory?

The `serviceAccessTokenHandlerModule` is registered as a **service factory** for `externalTokenHandlersServiceRef`, not as a backend module init hook. This is a deliberate design choice.

Backstage instantiates `core.auth` **per plugin**, and it does so during service construction — before any module init hooks run. The `externalTokenHandlersServiceRef` is a multiton service: each plugin gets its own instance, and the handlers must be present at construction time.

If the handler were registered as a module init hook, it would run after `core.auth` had already been constructed for the consuming plugins, and the handler would never be called.

The service factory approach ensures the handler is available during `core.auth` construction for every plugin that needs it.

**Consequence:** The handler must resolve the `access-tokens` plugin database independently, using `DatabaseManager.forPlugin('access-tokens', ...)`, rather than relying on the consuming plugin's scoped database. This is why `module.js` uses `createRequire` to load `DatabaseManager` from the consuming app's `node_modules`.

---

## Node module resolution

The plugin workspace does not install all Backstage packages locally. The `plugin-access-tokens-node` package uses `createRequire(import.meta.url)` to resolve Backstage internals from the consuming app's `node_modules` at runtime:

```javascript
const require = createRequire(import.meta.url);
const { createServiceFactory, coreServices } = require('@backstage/backend-plugin-api');
const { externalTokenHandlersServiceRef } = require('@backstage/backend-defaults/auth');
```

This pattern allows the plugin to be developed and tested in a standalone workspace while still resolving the correct Backstage version from the consuming app at runtime. It avoids version conflicts and duplicate package installations.

For consumers installing this plugin as regular dependencies in their Backstage app, this is primarily an implementation detail and should be transparent in normal operation.

Files using this pattern:
- `packages/plugin-access-tokens-node/src/module.js`
- `packages/plugin-access-tokens-node/src/serviceTokenHandler.js`

---

## Scope propagation — design decision

Token scopes are fetched from the database during verification and **cached alongside the subject** in the in-memory token cache. This means scopes are available to consumers without any additional database queries.

However, Backstage's `ExternalTokenHandler.verifyToken()` return type is `{ subject: string }` — there is no standard way to attach additional metadata (like scopes) to the auth principal. The scopes are therefore not part of the Backstage `BackstageCredentials` object that downstream plugins receive.

To bridge this gap, the plugin provides two mechanisms for consumers to access scopes:

1. **`getServiceTokenScopeResolver()`** — returns a function bound to the verification cache. Pass the raw token from the `Authorization` header and get back the scopes array. Zero-cost, no DB queries. Best for route-level middleware (Pattern A in the [Scope Enforcement Runbook](runbooks/scope-enforcement.md)).

2. **Direct database read** — parse the subject (`service-token:<group>:<name>`) to extract the group and token name, then query the `service_access_tokens` table. Required for permission policy integration (Pattern B) where the raw token is not available.

This design preserves the plugin's "minimal and non-opinionated" philosophy: scopes are **available** to consumers but not **enforced** by the plugin. Enforcement remains consumer-driven.

---

## Frontend conventions

The frontend package follows two conventions that differ from typical Backstage plugin development:

1. **`React.createElement` instead of JSX.** Components are written using `const h = React.createElement` rather than JSX syntax. The package does not configure a JSX transform, so JSX would require an additional build step. Using `createElement` directly keeps the package buildless.

2. **MUI v4 only.** The package uses `@material-ui/core` v4 and `@material-ui/icons` v4. Backstage's frontend system depends on MUI v4, and MUI v4 and v5 cannot coexist in the same app. Do not introduce `@mui/material` (v5+) imports.

---

## Testing approach

- **Backend unit tests** use Node's built-in `node:test` runner with SQLite (via `better-sqlite3`) for database tests. No Jest, no Vitest.
- **Frontend unit tests** use Node's built-in test runner for pure helper functions.
- **UI component tests** use Storybook — each component has a dedicated story file covering all meaningful states.
- **Integration tests** are run against a local Backstage harness app that installs the plugin packages and exercises the documented API and UI flows.

See [Testing Guide](testing.md) for the full end-to-end test walkthrough.
