# @adriandantas/plugin-service-tokens-backend

Backstage backend plugin for the service token lifecycle API.

This package provides the `/api/service-tokens` REST API, token persistence and migrations, scope catalogue assembly, and permission-gated create, read, audit, and revoke routes.

## When To Use This Package

Install this package when you want your Backstage backend to issue and manage long-lived, group-scoped service tokens.

Use it together with:

- `@adriandantas/plugin-service-tokens-node` to register the raw token auth handler and import service token permissions into your policy
- `@adriandantas/plugin-service-tokens` if you also want the admin UI at `/admin/service-tokens`

## Install

Add the backend plugin and its required node companion package to your Backstage backend workspace:

```bash
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-backend
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-node
```

## Minimum Working Setup

Register both the backend plugin and the auth handler module in your backend entry point:

```ts
// packages/backend/src/index.ts
import { createBackend } from '@backstage/backend-defaults';
import { serviceTokensPlugin } from '@adriandantas/plugin-service-tokens-backend';
import { serviceTokenHandlerModule } from '@adriandantas/plugin-service-tokens-node';

const backend = createBackend();

backend.add(serviceTokensPlugin);
backend.add(serviceTokenHandlerModule);

backend.start();
```

Why both registrations matter:

- `serviceTokensPlugin` serves the `/api/service-tokens` routes and manages storage
- `serviceTokenHandlerModule` makes raw service tokens authenticate successfully through Backstage's auth layer

## Permissions

This package expects the Backstage permission framework to be installed and your permission policy to grant the service token routes explicitly:

- `service-tokens:read`
- `service-tokens:write`
- `service-tokens:revoke`

Those permission definitions are exported by `@adriandantas/plugin-service-tokens-node`.

## Main Export

The primary integration export is:

- `serviceTokensPlugin` and the default export: the backend feature you add with `backend.add(...)`

This package also exports lower-level helpers for advanced or test-oriented use cases, including:

- `createExpressRouter` and `createHttpApi` for custom mounting
- `createKnexServiceTokenDatabase` and `createInMemoryServiceTokenDatabase` for storage integration and tests
- `applyServiceTokenMigrations` for direct migration control
- `defaultScopes` and `getScopeCatalogue` for scope catalogue composition

Most adopters should start with `serviceTokensPlugin` and only reach for the lower-level exports when they need custom backend wiring.

## What This Package Does Not Include

This package does not register the external auth handler by itself, which is why `@adriandantas/plugin-service-tokens-node` is required.

It also does not provide the frontend admin page. If you want the UI, install `@adriandantas/plugin-service-tokens` in your Backstage app package.

## Learn More

- [Root README](../../README.md) for the installation overview
- [Getting Started](../../docs/getting-started.md) for the supported integration flow
- [REST API Reference](../../docs/api.md) for route contracts and response shapes
- [Testing Guide](../../docs/testing.md) for post-install validation
