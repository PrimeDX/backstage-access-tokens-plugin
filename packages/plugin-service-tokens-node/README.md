# @adriandantas/plugin-service-tokens-node

Shared Backstage node library for service token auth and permission wiring.

This package is the backend-facing companion to the service token plugin. Most adopters use it to register the external auth handler that accepts raw service tokens and to import the permission definitions used by a Backstage permission policy.

## When To Use This Package

Install this package when you need either of these integration points:

- register `serviceTokenHandlerModule` in your backend so raw service tokens are accepted by Backstage auth
- import the service token permission definitions into your permission policy

You will typically install it together with `@adriandantas/plugin-service-tokens-backend`.

## Install

Add the package to your Backstage backend workspace:

```bash
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-node
```

## Minimum Working Setup

Register the auth handler module in your backend:

```ts
// packages/backend/src/index.ts
import { createBackend } from '@backstage/backend-defaults';
import { serviceTokenHandlerModule } from '@adriandantas/plugin-service-tokens-node';

const backend = createBackend();

backend.add(serviceTokenHandlerModule);
```

In the normal plugin installation flow you register this module alongside `serviceTokensPlugin` from `@adriandantas/plugin-service-tokens-backend`.

## Permission Exports

Use these permission definitions in your Backstage permission policy:

- `serviceTokensReadPermission`
- `serviceTokensWritePermission`
- `serviceTokensRevokePermission`

This package also exports:

- `serviceTokensAdminPermission` as a deprecated compatibility alias that maps to read-only behavior

New policies should use the granular read, write, and revoke permissions directly.

## Main Public Exports

The primary externally useful exports are:

- `serviceTokenHandlerModule`
- `serviceTokensReadPermission`
- `serviceTokensWritePermission`
- `serviceTokensRevokePermission`
- `serviceTokensPermissions`

This package also exposes lower-level helpers such as `verifyToken`, `createTokenCache`, `createServiceTokenAuthDatabase`, `createServiceTokenHandler`, and `createScopeResolver`.

Those helpers are useful for advanced integration and testing, but most adopters should not need them for the default install path.

## What This Package Does Not Include

This package does not provide the REST API routes or persistence plugin entry point by itself. For that, install `@adriandantas/plugin-service-tokens-backend`.

It also does not provide the admin UI. For that, install `@adriandantas/plugin-service-tokens` in your Backstage app package.

## Learn More

- [Root README](../../README.md) for the full package overview
- [Getting Started](../../docs/getting-started.md) for backend and policy wiring
- [REST API Reference](../../docs/api.md) for the backend contract this module supports
- [Testing Guide](../../docs/testing.md) for post-install validation
