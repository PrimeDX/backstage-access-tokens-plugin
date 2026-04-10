# Configuration Reference

All configuration lives under the `serviceTokens` key in `app-config.yaml`. Every key is optional — the plugin ships with sensible defaults and will start without any configuration present.

---

## Full example

```yaml
serviceTokens:
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

### `serviceTokens.cacheTtlSeconds`

| | |
|---|---|
| **Type** | integer |
| **Default** | `60` |
| **Package** | `plugin-service-tokens-node` |

How long (in seconds) a verified token is held in the in-memory cache before the next request triggers a fresh database lookup.

The cache is per-process. In a multi-replica deployment each replica maintains its own cache, so a revoked token may continue to be accepted for up to `cacheTtlSeconds` seconds on replicas that have a cached entry.

Set to `0` to disable caching (every request hits the database). This is not recommended for production.

```yaml
serviceTokens:
  cacheTtlSeconds: 30   # tighter TTL — revocations take effect faster
```

---

### `serviceTokens.maxTokenLifetimeDays`

| | |
|---|---|
| **Type** | integer |
| **Default** | `365` |
| **Package** | `plugin-service-tokens-backend` |

The maximum number of days a token may be valid for. The API rejects `POST /api/service-tokens` requests where the requested expiry exceeds this value.

```yaml
serviceTokens:
  maxTokenLifetimeDays: 90   # tokens expire in at most 90 days
```

---

### `serviceTokens.defaultTokenLifetimeDays`

| | |
|---|---|
| **Type** | integer |
| **Default** | same as `maxTokenLifetimeDays` |
| **Package** | `plugin-service-tokens-backend` |

The default expiry (in days) used when a `POST /api/service-tokens` request does not include an `expiresInDays` field. If not set, defaults to `maxTokenLifetimeDays`.

```yaml
serviceTokens:
  maxTokenLifetimeDays: 365
  defaultTokenLifetimeDays: 30   # new tokens default to 30 days unless overridden
```

---

### `serviceTokens.admin.userEntityRefs`

| | |
|---|---|
| **Type** | string array |
| **Default** | `['user:development/guest']` (development only) |
| **Package** | `plugin-service-tokens-backend` |

The list of Backstage user entity refs that your permission policy typically treats as service-token administrators. In the reference policy, these users receive `service-tokens:read`, `service-tokens:write`, and `service-tokens:revoke`.

Entity refs must be fully qualified: `user:<namespace>/<name>`.

```yaml
serviceTokens:
  admin:
    userEntityRefs:
      - user:default/alice
      - user:default/bob
      - user:default/platform-team-lead
```

> **Important:** The default value (`user:development/guest`) is intentionally permissive for local development. Always set an explicit list in production.

The permission check is delegated to your Backstage permission policy. The config value is read by the policy implementation — see [Getting Started § Step 4](getting-started.md#step-4--add-a-permission-policy) for the reference policy.

> **Migration note:** Older examples used a single `service-tokens.admin` permission. The current plugin uses three granular permissions instead. If you still check only `serviceTokensAdminPermission`, users will have read access only until you update your policy.

---

### `serviceTokens.scopes`

| | |
|---|---|
| **Type** | array of objects |
| **Default** | `[]` (built-in scopes are always included) |
| **Package** | `plugin-service-tokens-backend` |

Additional scopes to add to the scope catalogue, beyond the built-in defaults. Each entry requires three fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique scope identifier, e.g. `my-plugin:read` |
| `description` | string | Human-readable description shown in the UI |
| `plugin` | string | The plugin this scope relates to, e.g. `my-plugin` |

```yaml
serviceTokens:
  scopes:
    - id: my-plugin:read
      description: Read access to my plugin API
      plugin: my-plugin
    - id: my-plugin:write
      description: Write access to my plugin API
      plugin: my-plugin
```

Custom scopes are appended to the built-in scope list. The combined list is returned by `GET /api/service-tokens/scopes` and presented as checkboxes in the Create Token dialog.

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
      database: backstage_plugin_service_tokens
```

To use a dedicated SQLite file for the service-tokens plugin only (useful in development):

```yaml
backend:
  database:
    plugin:
      service-tokens:
        connection: '/tmp/service-tokens.sqlite'
```

Migrations run automatically on backend startup. No manual schema management is required.
