# REST API Reference

Audience: integrators and operators working directly with the token management API.

Use this reference for request and response contracts, route permissions, and development-time authentication examples.

The service token backend exposes its API at `/api/service-tokens`. Every endpoint requires a valid Backstage user session plus the route-specific permission listed below.

---

## Authentication

Every request must include a Backstage identity token in the `Authorization` header:

```
Authorization: Bearer <backstage-identity-token>
```

To obtain a token in development:

```bash
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' \
  | jq -r '.backstageIdentity.token')
```

In production, use your configured auth provider's token endpoint.

**Error responses:**

| Status | Meaning |
|---|---|
| `401 Unauthorized` | No token provided, or the token is invalid/expired |
| `403 Forbidden` | Token is valid but the user lacks the required route permission |

---

## Endpoints

### `GET /api/service-tokens/scopes`

Returns the list of available scopes that can be assigned to a token.

**Required permission:** `service-tokens:read`

**Request:** No body or query parameters.

**Response `200 OK`:**

```json
{
  "scopes": [
    {
      "id": "catalog:read",
      "description": "Read access to the Software Catalog API",
      "plugin": "catalog"
    },
    {
      "id": "catalog:write",
      "description": "Write access to the Software Catalog API",
      "plugin": "catalog"
    },
    {
      "id": "techdocs:read",
      "description": "Read access to TechDocs",
      "plugin": "techdocs"
    },
    {
      "id": "scaffolder:read",
      "description": "Read access to Scaffolder templates and tasks",
      "plugin": "scaffolder"
    },
    {
      "id": "scaffolder:execute",
      "description": "Execute Scaffolder templates",
      "plugin": "scaffolder"
    }
  ]
}
```

Custom scopes defined in `app-config.yaml` are appended to this list. See [Configuration Reference — serviceTokens.scopes](configuration.md#servicetokensscopes).

---

### `GET /api/service-tokens`

Returns the list of all service tokens. Supports optional filtering.

**Required permission:** `service-tokens:read`

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `status` | `active` \| `revoked` \| `expired` | Filter by token status. Omit to return all tokens. |
| `groupEntityRef` | string | Filter by owning group, e.g. `group:default/platform`. |

**Example:**

```bash
# All tokens
curl -s http://localhost:7007/api/service-tokens \
  -H "Authorization: Bearer $TOKEN" | jq .

# Active tokens only
curl -s "http://localhost:7007/api/service-tokens?status=active" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Tokens for a specific group
curl -s "http://localhost:7007/api/service-tokens?groupEntityRef=group:default/platform" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response `200 OK`:**

```json
{
  "tokens": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "name": "ci-pipeline",
      "description": "Token for the main CI pipeline",
      "groupEntityRef": "group:default/platform",
      "scopes": ["catalog:read", "scaffolder:execute"],
      "createdBy": "user:default/alice",
      "createdAt": "2025-01-15T10:30:00.000Z",
      "expiresAt": "2026-01-15T10:30:00.000Z",
      "revokedAt": null,
      "revokedBy": null,
      "status": "active"
    }
  ]
}
```

**Token object fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID) | Unique token identifier |
| `name` | string | Human-readable name, unique within a group |
| `description` | string | Optional description |
| `groupEntityRef` | string | Owning group entity ref |
| `scopes` | string[] | Assigned scopes |
| `createdBy` | string | User entity ref of the creator |
| `createdAt` | ISO 8601 | Creation timestamp |
| `expiresAt` | ISO 8601 | Expiry timestamp |
| `revokedAt` | ISO 8601 \| null | Revocation timestamp, or `null` if not revoked |
| `revokedBy` | string \| null | User entity ref of the revoker, or `null` |
| `status` | `active` \| `revoked` \| `expired` | Computed status |

> **Note:** The raw token value is **never** returned by this endpoint. It is only available in the response to `POST /api/service-tokens` at creation time.

---

### `POST /api/service-tokens`

Creates a new service token.

**Required permission:** `service-tokens:write`

**Request body:**

```json
{
  "name": "ci-pipeline",
  "description": "Token for the main CI pipeline",
  "groupEntityRef": "group:default/platform",
  "scopes": ["catalog:read", "scaffolder:execute"],
  "expiresInDays": 30
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Token name. Must be unique within the group. Max 100 characters. |
| `description` | string | | Human-readable description. |
| `groupEntityRef` | string | ✅ | Owning group. Must exist in the Backstage catalog. |
| `scopes` | string[] | ✅ | One or more scope IDs from the scope catalogue. |
| `expiresInDays` | integer | | Days until expiry. Defaults to `serviceTokens.defaultTokenLifetimeDays`. Cannot exceed `serviceTokens.maxTokenLifetimeDays`. |
| `expiresAt` | ISO 8601 | | Absolute expiry timestamp. Use either `expiresInDays` or `expiresAt`, not both. |

**Example:**

```bash
curl -s -X POST http://localhost:7007/api/service-tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ci-pipeline",
    "description": "Token for the main CI pipeline",
    "groupEntityRef": "group:default/platform",
    "scopes": ["catalog:read"],
    "expiresInDays": 30
  }' | jq .
```

**Response `201 Created`:**

```json
{
  "token": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "name": "ci-pipeline",
    "description": "Token for the main CI pipeline",
    "groupEntityRef": "group:default/platform",
    "scopes": ["catalog:read"],
    "createdBy": "user:default/alice",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "expiresAt": "2025-02-14T10:30:00.000Z",
    "revokedAt": null,
    "revokedBy": null,
    "status": "active"
  },
  "rawToken": "bsst_a1b2c3d4e5f6..."
}
```

> ⚠️ **The `rawToken` is shown only once.** It is not stored and cannot be retrieved again. Copy it immediately and store it securely (e.g. in a CI secret store).

**Error responses:**

| Status | Body | Cause |
|---|---|---|
| `422 Unprocessable Entity` | `{"error": "..."}` | Missing required fields, invalid scope IDs, expiry exceeds maximum, or group not found in catalog |
| `409 Conflict` | `{"error": "..."}` | A token with the same name already exists for this group |

---

### `GET /api/service-tokens/:id`

Returns a single token by ID.

**Required permission:** `service-tokens:read`

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | Token UUID |

**Example:**

```bash
curl -s http://localhost:7007/api/service-tokens/3fa85f64-5717-4562-b3fc-2c963f66afa6 \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response `200 OK`:**

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "name": "ci-pipeline",
  "description": "Token for the main CI pipeline",
  "groupEntityRef": "group:default/platform",
  "scopes": ["catalog:read"],
  "createdBy": "user:default/alice",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "expiresAt": "2025-02-14T10:30:00.000Z",
  "lastUsedAt": null,
  "revokedAt": null,
  "revokedBy": null,
  "status": "active"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `404 Not Found` | No token with the given ID exists |

---

### `DELETE /api/service-tokens/:id`

Revokes a token. The token is marked as revoked in the database and a `revoked` audit event is recorded. The raw token immediately stops working (subject to cache TTL).

**Required permission:** `service-tokens:revoke`

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | Token UUID |

**Request body (optional):**

```json
{
  "reason": "Rotating credentials after team member departure"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `reason` | string | | Human-readable reason for revocation. Stored in the audit log. |

**Example:**

```bash
curl -s -X DELETE http://localhost:7007/api/service-tokens/3fa85f64-5717-4562-b3fc-2c963f66afa6 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Rotating credentials"}' \
  -w "\nHTTP status: %{http_code}\n"
```

**Response `204 No Content`:** No body. The token has been revoked.

**Error responses:**

| Status | Cause |
|---|---|
| `404 Not Found` | No token with the given ID exists |
| `409 Conflict` | The token is already revoked |

---

### `GET /api/service-tokens/:id/audit`

Returns the audit log for a token — the ordered history of lifecycle events.

**Required permission:** `service-tokens:read`

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | Token UUID |

**Example:**

```bash
curl -s http://localhost:7007/api/service-tokens/3fa85f64-5717-4562-b3fc-2c963f66afa6/audit \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response `200 OK`:**

```json
{
  "events": [
    {
      "id": "a1b2c3d4-...",
      "tokenId": "3fa85f64-...",
      "event": "revoked",
      "actor": "user:default/alice",
      "metadata": {
        "reason": "Rotating credentials"
      },
      "occurredAt": "2025-01-20T14:00:00.000Z"
    },
    {
      "id": "e5f6a7b8-...",
      "tokenId": "3fa85f64-...",
      "event": "created",
      "actor": "user:default/alice",
      "metadata": {},
      "occurredAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

**Audit event fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID) | Unique event identifier |
| `tokenId` | string (UUID) | The token this event belongs to |
| `event` | `created` \| `revoked` | The lifecycle event |
| `actor` | string \| null | User entity ref of the actor |
| `metadata` | object | Event-specific metadata, such as `{ "reason": "..." }` for revocation |
| `occurredAt` | ISO 8601 | When the event occurred |

Events are returned in descending chronological order (newest first).

---

## Using a raw token

Raw service tokens are used as Bearer tokens against any Backstage backend API endpoint. They are verified by the `backstage-service-token` external auth handler and authenticate as the group the token was scoped to.

```bash
# Use a service token to call the Catalog API
curl -s "http://localhost:7007/api/catalog/entities?limit=10" \
  -H "Authorization: Bearer bsst_a1b2c3d4e5f6..."
```

**Token behaviour:**

- A valid, non-expired, non-revoked token returns `200` (or whatever the target endpoint returns for a valid request).
- A revoked token returns `401 Unauthorized` (after the cache TTL has elapsed).
- An expired token returns `401 Unauthorized`.
- A malformed or unknown token returns `401 Unauthorized`.

---

## Personal access token (user-tokens) endpoints

These endpoints implement the **user-self-service** PAT capability.
They are mounted under the same `service-tokens` plugin namespace
but at the `/personal/` sub-path:

| Method | Path | Auth | Permission |
|---|---|---|---|
| `POST` | `/api/service-tokens/personal/tokens/mint` | user session | `user-tokens:write` |
| `GET` | `/api/service-tokens/personal/tokens/mint/callback` | none (state-bound) | — |
| `GET` | `/api/service-tokens/personal/tokens` | user session | `user-tokens:read` |
| `GET` | `/api/service-tokens/personal/tokens/:id` | user session | `user-tokens:read` |
| `DELETE` | `/api/service-tokens/personal/tokens/:id` | user session | `user-tokens:revoke` |
| `GET` | `/api/service-tokens/personal/tokens/:id/audit` | user session | `user-tokens:read` |

All routes scope to the calling user. `GET /personal/tokens/:id`
returns `404` (not `403`) for another user's id so existence cannot
be probed across users.

### Mint a token

`POST /api/service-tokens/personal/tokens/mint` starts a same-tab
OAuth flow. The dialog calls this endpoint, then navigates the
browser to the returned `authorizeUrl`. After approval the user
returns to `/settings/personal-tokens#user-tokens-mint=<payload>`
and the dialog reopens automatically in result mode showing the raw
refresh token.

Request body:

```json
{ "name": "my-ci-token", "expiresAt": "2026-06-19T00:00:00.000Z" }
```

Successful response (`200`):

```json
{
  "flowId": "abc123",
  "authorizeUrl": "http://localhost:7007/api/auth/v1/authorize?response_type=code&...",
  "state": "opaque-single-use-string"
}
```

The full wire contract — including the redirect-with-fragment
shape on the callback and the error-fragment payload — is in
[`docs/spec/user-tokens-api.md`](spec/user-tokens-api.md).

### Using a personal access token

A personal access token is a Backstage **refresh token** that the
user's script exchanges for short-lived JWTs via the standard
RFC 6749 token endpoint exposed by `@backstage/plugin-auth-backend`
when DCR is enabled. Two `curl` calls:

```bash
# Step 1 — exchange refresh token for a JWT (no client credentials needed)
JWT=$(curl -s -X POST "$BACKSTAGE/api/auth/v1/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=refresh_token&refresh_token=$RT" \
  | jq -r .access_token)

# Step 2 — call any Backstage backend API as the user
curl -H "Authorization: Bearer $JWT" "$BACKSTAGE/api/catalog/entities"
```

The catalog, scaffolder, and every other backend plugin will see
the request as the **user principal** that minted the token, with
their `userEntityRef` and ownership claims — not a service principal.

**Token behaviour:**

- A valid, non-expired, non-revoked refresh token + a successful
  exchange return a JWT that authenticates as the user for ~10 min
  (the default JWT lifetime from auth-backend).
- A revoked refresh token returns `400 invalid_grant` from
  `/v1/token`.
- An expired refresh token returns `400 invalid_grant`.
- A malformed or unknown refresh token returns `400 invalid_grant`.
- Each `/refresh` rotates the refresh token (per auth-backend
  defaults). The plugin stores the original ciphertext; rotated
  versions are tracked by auth-backend's `OfflineAccessService`
  and remain accessible via the same `clientId`.

The token authenticates as a `service` principal with subject `service-token:<groupEntityRef>:<tokenName>` (e.g. `service-token:group:default/platform:ci-pipeline`). The consuming plugin sees this as a service principal and can apply its own authorization logic accordingly.
