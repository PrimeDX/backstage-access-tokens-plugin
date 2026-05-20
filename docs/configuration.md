# Configuration Reference

Audience: platform engineers configuring the plugin in an existing Backstage app.

Use this reference to tune token lifetime, cache behavior, admin access, and scope catalog entries.

All configuration lives under the `accessTokens` key in `app-config.yaml`. Every key is optional — the plugin ships with sensible defaults and will start without any configuration present.

---

## Full example

```yaml
accessTokens:
  service:
    cacheTtlSeconds: 60
    maxTokenLifetimeDays: 365
    defaultTokenLifetimeDays: 30
    admin:
      userEntityRefs:
        - user:default/alice
        - user:default/bob
    scopes:
      - id: my-plugin:read
        description: Read access to my plugin API
        plugin: my-plugin
      - id: my-plugin:write
        description: Write access to my plugin API
        plugin: my-plugin
```

---

## Keys

### `accessTokens.service.cacheTtlSeconds`

| | |
|---|---|
| **Type** | integer |
| **Default** | `60` |
| **Package** | `plugin-access-tokens-node` |

How long (in seconds) a verified token is held in the in-memory cache before the next request triggers a fresh database lookup.

The cache is per-process. In a multi-replica deployment each replica maintains its own cache, so a revoked token may continue to be accepted for up to `cacheTtlSeconds` seconds on replicas that have a cached entry.

Set to `0` to disable caching (every request hits the database). This is not recommended for production.

```yaml
accessTokens:
  service:
    cacheTtlSeconds: 30   # tighter TTL — revocations take effect faster
```

---

### `accessTokens.service.maxTokenLifetimeDays`

| | |
|---|---|
| **Type** | integer |
| **Default** | `365` |
| **Package** | `plugin-access-tokens-backend` |

The maximum number of days a token may be valid for. The API rejects `POST /api/access-tokens/service` requests where the requested expiry exceeds this value.

```yaml
accessTokens:
  service:
    maxTokenLifetimeDays: 90   # tokens expire in at most 90 days
```

---

### `accessTokens.service.defaultTokenLifetimeDays`

| | |
|---|---|
| **Type** | integer |
| **Default** | same as `maxTokenLifetimeDays` |
| **Package** | `plugin-access-tokens-backend` |

The default expiry (in days) used when a `POST /api/access-tokens/service` request does not include an `expiresInDays` field. If not set, defaults to `maxTokenLifetimeDays`.

```yaml
accessTokens:
  service:
    maxTokenLifetimeDays: 365
    defaultTokenLifetimeDays: 30   # new tokens default to 30 days unless overridden
```

---

### `accessTokens.service.admin.userEntityRefs`

| | |
|---|---|
| **Type** | string array |
| **Default** | `['user:development/guest']` (development only) |
| **Package** | `plugin-access-tokens-backend` |

The list of Backstage user entity refs that your permission policy typically treats as service-token administrators. In the reference policy, these users receive `access-tokens:service:read`, `access-tokens:service:write`, and `access-tokens:service:revoke`.

Entity refs must be fully qualified: `user:<namespace>/<name>`.

```yaml
accessTokens:
  service:
    admin:
      userEntityRefs:
        - user:default/alice
        - user:default/bob
        - user:default/platform-team-lead
```

> **Important:** The default value (`user:development/guest`) is intentionally permissive for local development. Always set an explicit list in production.

The permission check is delegated to your Backstage permission policy. The config value is read by the policy implementation — see [Getting Started](getting-started.md) for the reference policy in Step 4.

> **Migration note:** Older examples used a single `access-tokens.admin` permission. The current plugin uses three granular permissions instead. If you still check only `serviceAccessTokensReadPermission`, users will have read access only until you update your policy.

---

### `accessTokens.service.scopes`

| | |
|---|---|
| **Type** | array of objects |
| **Default** | `[]` (built-in scopes are always included) |
| **Package** | `plugin-access-tokens-backend` |

Additional scopes to add to the scope catalogue, beyond the built-in defaults. Each entry requires three fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique scope identifier, e.g. `my-plugin:read` |
| `description` | string | Human-readable description shown in the UI |
| `plugin` | string | The plugin this scope relates to, e.g. `my-plugin` |

```yaml
accessTokens:
  service:
    scopes:
      - id: my-plugin:read
        description: Read access to my plugin API
        plugin: my-plugin
      - id: my-plugin:write
        description: Write access to my plugin API
        plugin: my-plugin
```

Custom scopes are appended to the built-in scope list. The combined list is returned by `GET /api/access-tokens/service/scopes` and presented as checkboxes in the Create Token dialog.

---

## Built-in scopes

The following scopes are always available regardless of configuration:

| ID | Description | Plugin |
|---|---|---|
| `catalog:read` | Read access to the Software Catalog API | `catalog` |
| `catalog:write` | Write access to the Software Catalog API | `catalog` |
| `techdocs:read` | Read access to TechDocs | `techdocs` |
| `scaffolder:read` | Read access to Scaffolder templates and tasks | `scaffolder` |
| `scaffolder:execute` | Execute Scaffolder templates | `scaffolder` |

> **Note:** Scopes are informational metadata — they are stored with the token and visible in the UI, but the backend does not enforce scope-level access control on individual API calls. Enforcement is the responsibility of the consuming plugin or a future extension.
>
> Keep enforcement consumer-driven: implement route-level checks in the plugins/policies that own the target APIs.

---

## Personal access tokens

The plugin family also exposes a **user-self-service personal access
token** capability under `accessTokens.personal.*`. It is opt-in
and gated by upstream Backstage auth-backend flags; access-tokens
behavior is unchanged whether you enable it or not. See
[Getting Started §Step 8](getting-started.md#step-8--optional-enable-user-tokens)
for the integration walkthrough.

### Required upstream `auth.*` flags

Both must be `true` for the plugin to mount the `/personal/*`
routes. With either unset the plugin logs a warning at boot and
skips wiring; service tokens still work.

```yaml
auth:
  experimentalDynamicClientRegistration:
    enabled: true
  experimentalRefreshToken:
    enabled: true
```

### `accessTokens.personal` keys

```yaml
accessTokens:
  personal:
    enabled: true
    defaultExpiryDays: 30
    maxExpiryDays: 365
    encryptionKey: '<base64 of 32 random bytes>'
    dcrClient:
      clientId: '<opaque>'
      clientSecret: '<opaque>'
      redirectUri: '<host-app callback URL>'
```

#### `enabled` (default: `true`)

Set to `false` to keep the capability dormant even though the
upstream flags are on. Useful for operators rolling out gradually.

#### `defaultExpiryDays` (default: `30`)

Pre-populates the expiry input in the Create Token dialog. Users
can still override per token within the `maxExpiryDays` cap.

#### `maxExpiryDays` (default: `365`)

Upper bound on user-selected expiry. Must be ≤ Backstage
auth-backend's `maxRotationLifetime` (default 1 year), otherwise
auth-backend itself will reject `/refresh` once the rotation
window exceeds its limit.

#### `encryptionKey` (REQUIRED, no default)

Base64 of exactly 32 raw bytes. The plugin uses this key with
AES-256-GCM to encrypt the refresh token at rest in `personal_access_tokens`
so it can later be presented to RFC 7009 `/v1/revoke` at
revocation time. Generate with:

```bash
openssl rand -base64 32
```

The plugin refuses to mount the personal-access-token routes if this key is
missing or doesn't decode to 32 bytes. **Treat as a secret** —
losing it permanently breaks UI revocation for tokens minted
under it. See [Production Readiness](production-readiness.md) for
rotation guidance.

#### `dcrClient` (optional)

If present, the plugin uses the pre-registered OAuth client instead
of dynamically registering one via RFC 7591 on first mint. Useful
when your OAuth deployment requires admin pre-approval of clients,
or when you want a stable `clientId` across deploys.

If absent, the plugin self-registers a client on first mint and
caches it in the singleton `personal_access_tokens_dcr_client` table.

---

## Database configuration

The plugin uses Backstage's standard database service and does not add its own top-level config key for the database connection. Use the standard `backend.database` config:

```yaml
backend:
  database:
    client: pg
    connection:
      host: localhost
      port: 5432
      user: backstage
      password: secret
      database: backstage_plugin_service_access_tokens
```

To use a dedicated SQLite file for the access-tokens plugin only (useful in development):

```yaml
backend:
  database:
    plugin:
      access-tokens:
        connection: '/tmp/access-tokens.sqlite'
```

Migrations run automatically on backend startup. No manual schema management is required.
