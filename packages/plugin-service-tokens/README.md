# @primedx/plugin-service-tokens

Backstage frontend plugin for the service token admin page.

This package adds the `/admin/service-tokens` UI for creating, listing, auditing, and revoking service tokens. It registers the page in the new frontend system, but it does not provide the backend API or raw token auth handling on its own.

It also exports `userTokensAuthPlugin`, an optional frontend feature
that owns `/oauth2/authorize/:sessionId` for the personal access token
mint flow. Use it when you enable user tokens so users see a focused
"Create personal access token" consent screen.

## When To Use This Package

Install this package when you want the service token admin UI in your Backstage app.

Use it together with:

- `@primedx/plugin-service-tokens-backend` for the `/api/service-tokens` backend API and persistence
- `@primedx/plugin-service-tokens-node` for the backend auth handler and permission exports

## Install

Add the frontend plugin to your Backstage app workspace:

```bash
yarn --cwd packages/app add @primedx/plugin-service-tokens
```

## Minimum Working Setup

Register the frontend feature with `createApp({ features: [...] })`:

```ts
// packages/app/src/App.tsx
import { createApp } from '@backstage/frontend-defaults';
import serviceTokensPlugin from '@primedx/plugin-service-tokens';

const app = createApp({
  features: [
    serviceTokensPlugin,
  ],
});

export default app.createRoot();
```

The page is registered at `/admin/service-tokens`. No extra route wiring is required in the default frontend setup.
If you prefer named imports, `serviceTokensPlugin` is also exported by name.

For user tokens, register the companion consent feature before the main
plugin:

```ts
import serviceTokensPlugin, {
  userTokensAuthPlugin,
} from '@primedx/plugin-service-tokens';

const app = createApp({
  features: [userTokensAuthPlugin, serviceTokensPlugin],
});
```

Do not install another frontend feature that also registers `/oauth2`
unless your app intentionally handles that route conflict.

## Main Export

This package exports the frontend feature as:

- the default export
- `serviceTokensPlugin`
- `userTokensAuthPlugin` for the personal-token OAuth consent route

It also exports `rootRouteRef`, `userTokensRouteRef`, and
`userTokensAuthRouteRef` for apps that need access to route references.

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
