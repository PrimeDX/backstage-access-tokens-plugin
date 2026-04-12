# @adriandantas/plugin-service-tokens

Backstage frontend plugin for the service token admin page.

This package adds the `/admin/service-tokens` UI for creating, listing, auditing, and revoking service tokens. It registers the page in the new frontend system, but it does not provide the backend API or raw token auth handling on its own.

## When To Use This Package

Install this package when you want the service token admin UI in your Backstage app.

Use it together with:

- `@adriandantas/plugin-service-tokens-backend` for the `/api/service-tokens` backend API and persistence
- `@adriandantas/plugin-service-tokens-node` for the backend auth handler and permission exports

## Install

Add the frontend plugin to your Backstage app workspace:

```bash
yarn --cwd packages/app add @adriandantas/plugin-service-tokens
```

## Minimum Working Setup

Register the frontend feature with `createApp({ features: [...] })`:

```ts
// packages/app/src/App.tsx
import { createApp } from '@backstage/frontend-defaults';
import serviceTokensPlugin from '@adriandantas/plugin-service-tokens';

const app = createApp({
  features: [
    serviceTokensPlugin,
  ],
});

export default app.createRoot();
```

The page is registered at `/admin/service-tokens`. No extra route wiring is required in the default frontend setup.
If you prefer named imports, `serviceTokensPlugin` is also exported by name.

## Main Export

This package exports the frontend feature as:

- the default export
- `serviceTokensPlugin`

It also exports `rootRouteRef` for apps that need access to the route reference.

## What This Package Does Not Include

This package only provides the UI layer.

It does not:

- serve the `/api/service-tokens` endpoints
- store tokens
- verify raw service tokens in the backend auth layer
- grant permissions by itself

To make the page functional, wire the backend and node packages into your Backstage backend and add a permission policy that grants `service-tokens:read`, `service-tokens:write`, and `service-tokens:revoke` where appropriate.

## Learn More

- [Root README](../../README.md) for the package overview and install order
- [Getting Started](../../docs/getting-started.md) for full frontend and backend wiring
- [REST API Reference](../../docs/api.md) for the backend contract this UI consumes
- [Testing Guide](../../docs/testing.md) for post-install validation
