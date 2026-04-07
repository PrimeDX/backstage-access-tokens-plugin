# backstage-service-token-plugin

> Long-lived, group-scoped service tokens for Backstage — with a full admin UI, audit log, and permission-based access control.

[![Node 22](https://img.shields.io/badge/node-22-brightgreen)](https://nodejs.org/)
[![Backstage](https://img.shields.io/badge/backstage-compatible-blue)](https://backstage.io/)
[![Packages](https://img.shields.io/badge/packages-3-informational)](#packages)
[![License: BUSL-1.1](https://img.shields.io/badge/license-BUSL--1.1-yellow)](LICENSE)

---

## What is this?

Backstage's built-in auth model issues **short-lived user tokens** — great for browser sessions, but impractical for CI pipelines, scripts, and service-to-service integrations that need to call Backstage backend APIs without a human in the loop.

This plugin adds **service tokens**: named, group-scoped, long-lived credentials that are:

- Created and managed through a dedicated admin UI
- Stored as SHA-256 hashes — the raw token is shown **once** at creation and never again
- Verified by a custom `backstage-service-token` external auth handler wired into Backstage's auth layer
- Scoped to a catalog group — the token authenticates as a `service` principal with subject `service-token:<group>:<token-name>` (e.g. `service-token:group:default/platform:ci-pipeline`)
- Revocable at any time, with an optional reason captured in the audit log

---

## Features

| | |
|---|---|
| ✅ | Create named, group-scoped tokens with configurable scopes and expiry |
| ✅ | Raw token shown **once** at creation — SHA-256 hashed at rest |
| ✅ | Revoke tokens with optional reason |
| ✅ | Full per-token audit log (`created`, `revoked` events) |
| ✅ | Filter token list by status and owning group |
| ✅ | Permission-based admin authorization (`service-tokens.admin`) |
| ✅ | In-memory token cache with configurable TTL |
| ✅ | Automatic DB migrations via Knex (SQLite, Postgres, MySQL) |
| ✅ | Built-in scope catalogue + custom scopes via config |
| ✅ | Storybook stories for every UI component |

---

## Security model (important)

Service token **scopes are currently metadata only**. They are stored with the token, exposed in UI/API, and intended for policy decisions, but this plugin does **not** enforce scope-level authorization on arbitrary Backstage API routes.

If your organization requires strict scope enforcement, implement checks in consuming plugins/policies before using broad service tokens in production.

This plugin's security responsibilities are intentionally limited to token lifecycle controls (issuance, hashing at rest, verification, expiry, revocation, and audit trail) plus admin permission enforcement on service-token management APIs.

Auth/authz behavior changes should include explicit documentation and, when breaking or security-significant, migration notes.

---

## Framework prerequisites

This plugin builds on two Backstage framework capabilities. Neither requires a specific provider — the recommendations below are the most common starting points.

| Capability | What it does for this plugin | Recommended setup | Backstage docs |
|---|---|---|---|
| **Default auth policy** | Validates every inbound token (service or user) before your route handler runs | Built-in — active by default in `createBackend()`. Do **not** set `dangerouslyDisableDefaultAuthPolicy: true` in production. | [Auth service overview](https://backstage.io/docs/backend-system/core-services/auth) |
| **Permission framework** | Enforces the `service-tokens.admin` permission on all token management endpoints | Install `@backstage/plugin-permission-backend` and wire a policy (see [Quick Start Step 4](#4-add-a-permission-policy)) | [Permission framework overview](https://backstage.io/docs/permissions/overview) |

> If you are starting from scratch with either framework, the [Getting Started guide](docs/getting-started.md) includes wiring examples for both. You can also follow the linked Backstage docs independently before installing this plugin.

---

## Packages

This workspace contains three packages that work together:

| Package | Role |
|---|---|
| [`@adriandantas/plugin-service-tokens`](packages/plugin-service-tokens) | Frontend plugin — admin UI at `/admin/service-tokens` |
| [`@adriandantas/plugin-service-tokens-backend`](packages/plugin-service-tokens-backend) | Backend plugin — REST API, Knex persistence, permission enforcement |
| [`@adriandantas/plugin-service-tokens-node`](packages/plugin-service-tokens-node) | Shared node library — token verification, cache, auth handler module |

---

## Quick Start

### 1. Add the packages to your Backstage app

Install the published packages directly from npm under the `@adriandantas` scope.

In your Backstage app repo, add local file dependencies:

```json
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-backend
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-node
```

```bash
yarn --cwd packages/app add @adriandantas/plugin-service-tokens
```

### 2. Register the backend plugin

```typescript
// packages/backend/src/index.ts
import { serviceTokensPlugin } from '@adriandantas/plugin-service-tokens-backend';
import { serviceTokenHandlerModule } from '@adriandantas/plugin-service-tokens-node';

backend.add(serviceTokensPlugin);
backend.add(serviceTokenHandlerModule);
```

### 3. Register the frontend plugin

```typescript
// packages/app/src/App.tsx (new frontend system)
import serviceTokensPlugin from '@adriandantas/plugin-service-tokens';

app.addFeatures([serviceTokensPlugin]);
```

### 4. Add a permission policy

```typescript
// packages/backend/src/serviceTokensPermissionPolicy.ts
import { serviceTokensAdminPermission } from '@adriandantas/plugin-service-tokens-node';

class ServiceTokensPermissionPolicy implements PermissionPolicy {
  async handle(request, user) {
    if (isPermission(request.permission, serviceTokensAdminPermission)) {
      const adminRefs = config.getOptionalStringArray('serviceTokens.admin.userEntityRefs') ?? [];
      if (adminRefs.includes(user?.info.userEntityRef ?? '')) {
        return { result: AuthorizeResult.ALLOW };
      }
      return { result: AuthorizeResult.DENY };
    }
    return { result: AuthorizeResult.ALLOW };
  }
}
```

### 5. Configure

```yaml
# app-config.yaml
serviceTokens:
  admin:
    userEntityRefs:
      - user:default/alice
      - user:default/bob
```

That's it. Navigate to `/admin/service-tokens` in your Backstage app.

---

## Using a Service Token

Once a token is created, use it as a Bearer token against any Backstage backend API:

```bash
curl -s "https://your-backstage/api/catalog/entities?limit=10" \
  -H "Authorization: Bearer <rawToken>"
```

The token authenticates as the group it was scoped to. Revoked or expired tokens return `401 Unauthorized`.

---

## 📚 Documentation

| Document | Audience | Description |
|---|---|---|
| [Documentation Home](docs/index.md) | All audiences | Top-level docs index and suggested reading order |
| [Getting Started](docs/getting-started.md) | Platform engineer | Complete install and wiring walkthrough |
| [Configuration Reference](docs/configuration.md) | Platform engineer | Every config key, defaults, and examples |
| [REST API Reference](docs/api.md) | Consumer / integrator | All endpoints, request/response shapes, error codes |
| [Architecture](docs/architecture.md) | Contributor / advanced user | Package internals, token lifecycle, DB schema |
| [Testing Guide](docs/testing.md) | Developer | End-to-end test walkthrough (API and UI paths) |
| [Production Readiness](docs/production-readiness.md) | Platform engineer | Group-based admin access, policy merging, cache TTL, audit retention |
| [Release Guide](docs/releasing.md) | Maintainer | Changesets and npm publishing workflow |

---

## Publication readiness checklist

Before publishing the first release:

- Add screenshots or GIFs for `/admin/service-tokens` (table + create + audit + revoke)
- Wire CI status and npm version badges once the repository remote exists
- Tag the first release (`v0.1.0` or `v1.0.0` per your semver strategy)
- Keep docs publishing phased: 1) in-repo docs, 2) GitHub Pages publishing, 3) operator runbooks/cookbooks

---

## Development

### Prerequisites

- Node.js 22 (via `nvm`)

```bash
nvm install 22
nvm use 22
```

### Run tests

```bash
npm test

# Focused package runs
npm run test:backend
npm run test:node
npm run test:frontend
```

### Preview docs

```bash
npm run docs:serve
```

Serves the documentation site at `http://localhost:8000`. On first use, create the local Python venv and install MkDocs into it:

```bash
# On Debian/Ubuntu/WSL — install python3-venv first if not present
sudo apt-get install -y python3-venv
# Create the venv and install MkDocs (one-time)
npm run docs:install
# Then serve
npm run docs:serve
```

The venv is created at `.venv/` (gitignored). After the one-time install, only `npm run docs:serve` is needed.

### Run Storybook

```bash
npm run storybook
```

### Verify package contents

```bash
npm run pack:dry-run
```

Stories are available for all five UI components: `ServiceTokensTableView`, `ServiceTokensFilters`, `CreateTokenDialog`, `RevokeDialog`, and `AuditLogDialog`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Business Source License 1.1 (BUSL-1.1).

✅ Free for teams to self-host and use internally.  
❌ Hosting this plugin (or a substantially similar managed service) for third parties requires a commercial license from the licensor.

See [LICENSE](LICENSE) for full terms.
