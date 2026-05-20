# @primedx/plugin-access-tokens-backend

Backstage backend plugin for access token lifecycle APIs.

This package provides the `/api/access-tokens/service` REST API for service tokens and the optional `/api/access-tokens/personal` capability for user-managed personal access tokens. It owns token persistence and migrations, scope catalogue assembly, and permission-gated create, read, audit, and revoke routes.

## When To Use This Package

Install this package when you want your Backstage backend to issue and manage long-lived, group-scoped service tokens and optionally support user-managed personal access tokens.

Use it together with:

- `@primedx/plugin-access-tokens-node` to register the raw token auth handler and import service token permissions into your policy
- `@primedx/plugin-access-tokens` if you also want the admin UI at `/admin/access-tokens`

## Install

Add the backend plugin and its required node companion package to your Backstage backend workspace:

```bash
yarn --cwd packages/backend add @primedx/plugin-access-tokens-backend
yarn --cwd packages/backend add @primedx/plugin-access-tokens-node
```

## Minimum Working Setup

Register both the backend plugin and the auth handler module in your backend entry point:

```ts
// packages/backend/src/index.ts
import { createBackend } from '@backstage/backend-defaults';
import { accessTokensPlugin } from '@primedx/plugin-access-tokens-backend';
import { serviceAccessTokenHandlerModule } from '@primedx/plugin-access-tokens-node';

const backend = createBackend();

backend.add(accessTokensPlugin);
backend.add(serviceAccessTokenHandlerModule);

backend.start();
```

Why both registrations matter:

- `accessTokensPlugin` serves the access token routes and manages storage
- `serviceAccessTokenHandlerModule` makes raw service tokens authenticate successfully through Backstage's auth layer

## Permissions

This package expects the Backstage permission framework to be installed and your permission policy to grant the service token routes explicitly:

- `access-tokens:service:read`
- `access-tokens:service:write`
- `access-tokens:service:revoke`

Those permission definitions are exported by `@primedx/plugin-access-tokens-node`.

## Main Export

The primary integration export is:

- `accessTokensPlugin` and the default export: the backend feature you add with `backend.add(...)`

This package also exports lower-level helpers for advanced or test-oriented use cases, including:

- `createExpressRouter` and `createHttpApi` for custom mounting
- `createKnexServiceTokenDatabase` and `createInMemoryServiceTokenDatabase` for storage integration and tests
- `applyServiceTokenMigrations` for direct migration control
- `defaultScopes` and `getScopeCatalogue` for scope catalogue composition

Most adopters should start with `accessTokensPlugin` and only reach for the lower-level exports when they need custom backend wiring.

## What This Package Does Not Include

This package does not register the external auth handler by itself, which is why `@primedx/plugin-access-tokens-node` is required.

It also does not provide the frontend admin page. If you want the UI, install `@primedx/plugin-access-tokens` in your Backstage app package.

## Learn More

- [Root README](../../README.md) for the installation overview
- [Getting Started](../../docs/getting-started.md) for the supported integration flow
- [REST API Reference](../../docs/api.md) for route contracts and response shapes
- [Testing Guide](../../docs/testing.md) for post-install validation
