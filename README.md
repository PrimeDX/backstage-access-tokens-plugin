# Backstage Access Tokens Plugin

> Long-lived Backstage credentials for user and service integrations. The plugin provides user-self-service personal access tokens, plus admin-managed service tokens for group-scoped automation.

[![Node 22](https://img.shields.io/badge/node-22-brightgreen)](https://nodejs.org/)
[![Backstage](https://img.shields.io/badge/backstage-compatible-blue)](https://backstage.io/)
[![Packages](https://img.shields.io/badge/packages-3-informational)](#packages)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

## What This Plugin Does

Backstage's built-in auth model is centered on short-lived user tokens. That is a good fit for browser sessions, but it is awkward for developer tooling, CI jobs, automation, and service-to-service integrations that need stable credentials for backend APIs.

This plugin offers two complementary capabilities:

**Personal access tokens (PATs)** — user-self-service, **user principals**:

- minted by any authenticated Backstage user from the
  `Settings` → `Personal Access Tokens` tab (`/settings/personal-tokens`)
- each personal access token is a user-managed Backstage refresh token, backed by Backstage's standard OAuth 2.0 + Dynamic Client Registration pipeline
- integrations exchange the refresh token at `/api/auth/v1/token` for a short-lived Backstage API JWT, then call Backstage APIs with that JWT as `Authorization: Bearer <access_token>`
- the raw refresh token is shown once at creation time, then encrypted at rest with AES-256-GCM in the plugin DB so the plugin can later call RFC 7009 `/v1/revoke` on the user's behalf
- requires the auth-backend flags `auth.experimentalDynamicClientRegistration.enabled` and `auth.experimentalRefreshToken.enabled`, plus a 32-byte base64 `accessTokens.personal.encryptionKey`
- gated by separate permissions: `access-tokens:user:read`, `access-tokens:user:write`, `access-tokens:user:revoke` — default-open for the calling user, tightenable by policy

**Service tokens** — admin-managed, group-scoped, **service principals**:

- created and managed through an admin page at `/admin/access-tokens`
- stored as SHA-256 hashes, with the raw token shown only once at creation time
- scoped to a catalog group and resolved as a `service` principal
- revocable, with audit events for creation and revocation
- protected by granular admin permissions: `access-tokens:service:read`, `access-tokens:service:write`, and `access-tokens:service:revoke`

## What This Plugin Does Not Do

Personal access tokens are refresh tokens. Do not send them directly as API bearer tokens; exchange them at `/api/auth/v1/token` and use the returned short-lived `access_token` for Backstage API calls.

Service token scopes are metadata only. They are stored, displayed, and exposed through the API, but this plugin does not automatically enforce scope-level authorization on arbitrary Backstage routes.

If you need strict scope enforcement, implement those checks in the consuming plugin or permission policy. For personal access tokens, the plugin coordinates the mint flow, stores encrypted refresh tokens for later revocation, and manages token metadata. For service tokens, it handles issuance, hashing at rest, verification, expiry, revocation, audit logging, and admin authorization around token management.

## Packages

This workspace publishes three packages:

| Package | Purpose |
|---|---|
| [`@primedx/plugin-access-tokens`](packages/plugin-access-tokens) | Frontend plugin with the personal-token settings tab, PAT consent route, and service-token admin UI |
| [`@primedx/plugin-access-tokens-backend`](packages/plugin-access-tokens-backend) | Backend plugin with PAT and service-token REST APIs, persistence, and permission checks |
| [`@primedx/plugin-access-tokens-node`](packages/plugin-access-tokens-node) | Shared node library with user-token and service-token permissions, the service-token auth handler module, and token verification utilities |

## Before You Install

This plugin expects a Backstage app that already uses:

- the new backend system with `createBackend()`
- the new frontend system with `createApp({ features: [...] })`
- the default auth policy enabled
- the Backstage permission framework for admin authorization

The [install guide](docs/how-to/install.md) walks through these prerequisites in detail for an existing Backstage app. The [tutorial](docs/tutorials/build-a-backstage-app.md) covers the full from-scratch experience.

## Quick Start

### 1. Install the packages

Add the published packages to your Backstage app:

```bash
yarn --cwd packages/backend add @primedx/plugin-access-tokens-backend
yarn --cwd packages/backend add @primedx/plugin-access-tokens-node
yarn --cwd packages/app add @primedx/plugin-access-tokens
```

### 2. Register the backend plugin and auth handler

```ts
// packages/backend/src/index.ts
import { accessTokensPlugin } from '@primedx/plugin-access-tokens-backend';
import { serviceAccessTokenHandlerModule } from '@primedx/plugin-access-tokens-node';

backend.add(accessTokensPlugin);
backend.add(serviceAccessTokenHandlerModule);
```

### 3. Register the frontend plugin

```ts
// packages/app/src/App.tsx
import { createApp } from '@backstage/frontend-defaults';
import accessTokensPlugin from '@primedx/plugin-access-tokens';

const app = createApp({
  features: [accessTokensPlugin],
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
  personalAccessTokensReadPermission,
  personalAccessTokensWritePermission,
  personalAccessTokensRevokePermission,
  serviceAccessTokensReadPermission,
  serviceAccessTokensWritePermission,
  serviceAccessTokensRevokePermission,
} from '@primedx/plugin-access-tokens-node';

class ServiceTokensPermissionPolicy implements PermissionPolicy {
  constructor(private readonly config: Config) {}

  async handle(request, user) {
    const adminRefs =
      this.config.getOptionalStringArray('accessTokens.service.admin.userEntityRefs') ?? [];

    const isAdmin = adminRefs.includes(user?.info.userEntityRef ?? '');

    if (
      isPermission(request.permission, personalAccessTokensReadPermission) ||
      isPermission(request.permission, personalAccessTokensWritePermission) ||
      isPermission(request.permission, personalAccessTokensRevokePermission)
    ) {
      return { result: AuthorizeResult.ALLOW };
    }

    if (
      isPermission(request.permission, serviceAccessTokensReadPermission) ||
      isPermission(request.permission, serviceAccessTokensWritePermission) ||
      isPermission(request.permission, serviceAccessTokensRevokePermission)
    ) {
      return {
        result: isAdmin ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
      };
    }

    return { result: AuthorizeResult.ALLOW };
  }
}
```

Personal access tokens use `access-tokens:user:*` permissions and are usually default-open for the calling user. Service tokens use `access-tokens:service:*` permissions and are usually limited to platform administrators.

### 5. Enable personal access tokens

Personal access tokens are user-managed Backstage refresh tokens. They are not sent directly as API bearer tokens; integrations exchange them for short-lived Backstage API JWTs that authenticate as the user principal.

Add two upstream auth-backend flags and an encryption key to `app-config.yaml`:

```yaml
auth:
  experimentalDynamicClientRegistration:
    enabled: true
  experimentalRefreshToken:
    enabled: true

accessTokens:
  personal:
    encryptionKey: '<output of `openssl rand -base64 32`>'
```

Wire the personal-token consent route into the frontend so `/oauth2/authorize/:sessionId` resolves to the plugin's focused "Create personal access token" approval screen:

```ts
// packages/app/src/App.tsx
import accessTokensPlugin, {
  personalAccessTokensAuthPlugin,
} from '@primedx/plugin-access-tokens';

export default createApp({
  features: [personalAccessTokensAuthPlugin, /* …, */ accessTokensPlugin],
});
```

Do not install both `personalAccessTokensAuthPlugin` and Backstage's stock auth consent frontend for `/oauth2` unless your app intentionally resolves that route conflict itself.

After restarting the backend you should see this log line at boot:

```
access-tokens info personal-access-token capability enabled at /api/access-tokens/personal
```

Then any authenticated user can mint, list, and revoke tokens from `Settings` → `Personal Access Tokens` (`/settings/personal-tokens`). See [Install §Step 8](docs/how-to/install.md#step-8-optional-enable-personal-access-tokens) for the full walkthrough including a smoke test.

### 6. Configure service-token administrators

```yaml
# app-config.yaml
accessTokens:
  service:
    admin:
      userEntityRefs:
        - user:default/alice
        - user:default/bob
```

At that point the service-token admin UI is available at `/admin/access-tokens`.

## Using a Personal Access Token

A personal access token is a user-managed **Backstage refresh token**.
Do not send it directly as `Authorization: Bearer <token>` to catalog,
scaffolder, or other Backstage APIs. Any integration or programming
language that can make HTTP requests can use it with this protocol:

1. Store the personal access token securely.
2. POST it to `/api/auth/v1/token` with `grant_type=refresh_token`.
3. Use the returned `access_token` as the bearer token for Backstage APIs.

```bash
BACKSTAGE=https://your-backstage.example.com
REFRESH_TOKEN=<personal-access-token>

ACCESS_TOKEN=$(curl -s -X POST "$BACKSTAGE/api/auth/v1/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=refresh_token' \
  --data-urlencode "refresh_token=$REFRESH_TOKEN" \
  | jq -r .access_token)

curl -s "$BACKSTAGE/api/catalog/entities?limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

The returned API token authenticates as the user principal that minted
the personal access token. Service tokens are different: a service token
is used directly as a bearer token and authenticates as its configured
service principal.

## Using a Service Token

Once a service token is created, use it as a bearer token against any Backstage backend API:

```bash
curl -s "https://your-backstage.example.com/api/catalog/entities?limit=10" \
  -H "Authorization: Bearer <raw-token>"
```

The service token authenticates as the group it was created for. Revoked or
expired service tokens eventually stop working once cache invalidation
propagates, bounded by `accessTokens.service.cacheTtlSeconds`.

For deterministic local testing of immediate service-token revocation, set
`accessTokens.service.cacheTtlSeconds: 0`.

## Security Notes

- Keep the default auth policy enabled. Do not set `backend.auth.dangerouslyDisableDefaultAuthPolicy: true` in production.
- Store personal access tokens as secrets and exchange them for short-lived Backstage API tokens before calling APIs.
- Treat service token scopes as advisory metadata unless you have added enforcement in consuming plugins or policies.
- The raw token is shown once and cannot be retrieved later.
- Audit responses use `{ "events": [...] }` and are returned newest-first.

## Documentation

Start here based on what you are trying to do:

| Doc | Audience | Purpose |
|---|---|---|
| [Documentation Home](docs/index.md) | Everyone | Entry point and reading guide |
| [Tutorial](docs/tutorials/build-a-backstage-app.md) | Evaluator or new adopter | End-to-end install in a fresh Backstage app |
| [Install in an Existing App](docs/how-to/install.md) | Platform engineer | Integrate the plugin into an existing Backstage app |
| [Configuration Reference](docs/reference/configuration.md) | Platform engineer | Configure token TTL, scopes, and admin access |
| [REST API Reference](docs/reference/rest-api.md) | Integrator | Request and response contracts for every endpoint |
| [Test the Plugin](docs/how-to/test.md) | Adopter or operator | Validate the plugin through API, UI, and smoke checks |
| [Prepare for Production](docs/how-to/production.md) | Platform engineer | Hardening guidance for auth, policy, and operations |
| [Architecture Explained](docs/explanation/architecture.md) | Contributor | Internal design and package responsibilities |
| [Contract Decisions](docs/reference/contract-decisions.md) | Contributor or reviewer | Canonical public behavior that should stay stable |
| [Test Local Package Changes](docs/how-to/test-local-changes.md) | Maintainer | Fast repeatable verification for unpublished changes |
| [Contribute with Git](docs/how-to/contribute-with-git.md) | Maintainer or contributor | Branching and pull request conventions for this repository |
| [Release to npm](docs/how-to/release.md) | Maintainer | Changesets and npm publishing workflow |

## Package READMEs

If you are looking at this project from npm package pages:

- [Frontend package README](packages/plugin-access-tokens/README.md)
- [Backend package README](packages/plugin-access-tokens-backend/README.md)
- [Node package README](packages/plugin-access-tokens-node/README.md)

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

If you are iterating on unpublished package changes, use the maintainer-focused [local package testing guide](docs/how-to/test-local-changes.md).

## License

Apache License 2.0 (Apache-2.0).

See [LICENSE](LICENSE) for full terms.
