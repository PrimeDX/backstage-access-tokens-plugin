# backstage-service-token-plugin

> Long-lived, group-scoped service tokens for Backstage, with a dedicated admin UI, audit log, and permission-aware management API.

[![Node 22](https://img.shields.io/badge/node-22-brightgreen)](https://nodejs.org/)
[![Backstage](https://img.shields.io/badge/backstage-compatible-blue)](https://backstage.io/)
[![Packages](https://img.shields.io/badge/packages-3-informational)](#packages)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

## What This Plugin Does

Backstage's built-in auth model is centered on short-lived user tokens. That is a good fit for browser sessions, but it is awkward for CI jobs, automation, and service-to-service integrations that need stable credentials for backend APIs.

This plugin adds service tokens that are:

- created and managed through an admin page at `/admin/service-tokens`
- stored as SHA-256 hashes, with the raw token shown only once at creation time
- scoped to a catalog group and resolved as a `service` principal
- revocable, with audit events for creation and revocation
- protected by granular admin permissions: `service-tokens:read`, `service-tokens:write`, and `service-tokens:revoke`

## What This Plugin Does Not Do

Service token scopes are metadata only. They are stored, displayed, and exposed through the API, but this plugin does not automatically enforce scope-level authorization on arbitrary Backstage routes.

If you need strict scope enforcement, implement those checks in the consuming plugin or permission policy. The plugin itself is responsible for token issuance, hashing at rest, verification, expiry, revocation, audit logging, and admin authorization around token management.

## Packages

This workspace publishes three packages:

| Package | Purpose |
|---|---|
| [`@primedx/plugin-service-tokens`](packages/plugin-service-tokens) | Frontend plugin that adds the admin UI |
| [`@primedx/plugin-service-tokens-backend`](packages/plugin-service-tokens-backend) | Backend plugin with the REST API, persistence, and permission checks |
| [`@primedx/plugin-service-tokens-node`](packages/plugin-service-tokens-node) | Shared node library with the auth handler module, permission exports, and token verification utilities |

## Before You Install

This plugin expects a Backstage app that already uses:

- the new backend system with `createBackend()`
- the new frontend system with `createApp({ features: [...] })`
- the default auth policy enabled
- the Backstage permission framework for admin authorization

The [Getting Started guide](docs/getting-started.md) walks through these prerequisites in detail for an existing Backstage app. The [Tutorial](docs/tutorial.md) covers the full from-scratch experience.

## Quick Start

### 1. Install the packages

Add the published packages to your Backstage app:

```bash
yarn --cwd packages/backend add @primedx/plugin-service-tokens-backend
yarn --cwd packages/backend add @primedx/plugin-service-tokens-node
yarn --cwd packages/app add @primedx/plugin-service-tokens
```

### 2. Register the backend plugin and auth handler

```ts
// packages/backend/src/index.ts
import { serviceTokensPlugin } from '@primedx/plugin-service-tokens-backend';
import { serviceTokenHandlerModule } from '@primedx/plugin-service-tokens-node';

backend.add(serviceTokensPlugin);
backend.add(serviceTokenHandlerModule);
```

### 3. Register the frontend plugin

```ts
// packages/app/src/App.tsx
import { createApp } from '@backstage/frontend-defaults';
import serviceTokensPlugin from '@primedx/plugin-service-tokens';

const app = createApp({
  features: [serviceTokensPlugin],
});

export default app.createRoot();
```

### 4. Add a permission policy

```ts
// packages/backend/src/serviceTokensPermissionPolicy.ts
import {
  AuthorizeResult,
  isPermission,
} from '@backstage/plugin-permission-common';
import { PermissionPolicy } from '@backstage/plugin-permission-node';
import { Config } from '@backstage/config';
import {
  serviceTokensReadPermission,
  serviceTokensWritePermission,
  serviceTokensRevokePermission,
} from '@primedx/plugin-service-tokens-node';

class ServiceTokensPermissionPolicy implements PermissionPolicy {
  constructor(private readonly config: Config) {}

  async handle(request, user) {
    const adminRefs =
      this.config.getOptionalStringArray('serviceTokens.admin.userEntityRefs') ?? [];

    const isAdmin = adminRefs.includes(user?.info.userEntityRef ?? '');

    if (
      isPermission(request.permission, serviceTokensReadPermission) ||
      isPermission(request.permission, serviceTokensWritePermission) ||
      isPermission(request.permission, serviceTokensRevokePermission)
    ) {
      return {
        result: isAdmin ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
      };
    }

    return { result: AuthorizeResult.ALLOW };
  }
}
```

Existing policies that still check only `serviceTokensAdminPermission` will grant read access only. Update them before rollout if those users should also create or revoke tokens.

### 5. Add minimal configuration

```yaml
# app-config.yaml
serviceTokens:
  admin:
    userEntityRefs:
      - user:default/alice
      - user:default/bob
```

At that point the admin UI is available at `/admin/service-tokens`.

## Using a Service Token

Once a token is created, use it as a bearer token against any Backstage backend API:

```bash
curl -s "https://your-backstage.example.com/api/catalog/entities?limit=10" \
  -H "Authorization: Bearer <raw-token>"
```

The token authenticates as the group it was created for. Revoked or expired tokens eventually stop working once cache invalidation propagates, bounded by `serviceTokens.cacheTtlSeconds`.

For deterministic local testing of immediate revocation, set `serviceTokens.cacheTtlSeconds: 0`.

## Security Notes

- Keep the default auth policy enabled. Do not set `backend.auth.dangerouslyDisableDefaultAuthPolicy: true` in production.
- Treat service token scopes as advisory metadata unless you have added enforcement in consuming plugins or policies.
- The raw token is shown once and cannot be retrieved later.
- Audit responses use `{ "events": [...] }` and are returned newest-first.

## Documentation

Start here based on what you are trying to do:

| Doc | Audience | Purpose |
|---|---|---|
| [Documentation Home](docs/index.md) | Everyone | Entry point and reading guide |
| [Tutorial](docs/tutorial.md) | Evaluator or new adopter | End-to-end install in a fresh Backstage app |
| [Getting Started](docs/getting-started.md) | Platform engineer | Integrate the plugin into an existing Backstage app |
| [Configuration Reference](docs/configuration.md) | Platform engineer | Configure token TTL, scopes, and admin access |
| [REST API Reference](docs/api.md) | Integrator | Request and response contracts for every endpoint |
| [Testing Guide](docs/testing.md) | Adopter or operator | Validate the plugin through API, UI, and smoke checks |
| [Production Readiness](docs/production-readiness.md) | Platform engineer | Hardening guidance for auth, policy, and operations |
| [Architecture](docs/architecture.md) | Contributor | Internal design and package responsibilities |
| [Contract Decisions](docs/contract-decisions.md) | Contributor or reviewer | Canonical public behavior that should stay stable |
| [Developer Test Guide](docs/developer-test-guide.md) | Maintainer | Fast repeatable verification for unpublished changes |
| [Git Workflow](docs/git-workflow.md) | Maintainer or contributor | Branching and pull request conventions for this repository |
| [Release Guide](docs/releasing.md) | Maintainer | Changesets and npm publishing workflow |

## Package READMEs

If you are looking at this project from npm package pages:

- [Frontend package README](packages/plugin-service-tokens/README.md)
- [Backend package README](packages/plugin-service-tokens-backend/README.md)
- [Node package README](packages/plugin-service-tokens-node/README.md)

## Development

### Prerequisites

- Node.js 22
- npm or Yarn workspace tooling

```bash
nvm install 22
nvm use 22
```

### Run tests

```bash
npm test
npm run test:backend
npm run test:node
npm run test:frontend
```

### Preview docs

```bash
npm run docs:install
npm run docs:serve
```

### Run Storybook

```bash
npm run storybook
```

### Verify package contents

```bash
npm run pack:dry-run
```

### Check dependency risk locally

Run the dependency audit gate that mirrors the repository's dependency review expectations:

```bash
npm run security:changed
```

If you want a full snapshot audit even when lockfiles did not change:

```bash
npm run security:check
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution standards and the pull request checklist.

`AGENTS.md` is also tracked in this repository to define expectations for coding agents working on the project.

If you are iterating on unpublished package changes, use the maintainer-focused [Developer Test Guide](docs/developer-test-guide.md).

## License

Apache License 2.0 (Apache-2.0).

See [LICENSE](LICENSE) for full terms.
