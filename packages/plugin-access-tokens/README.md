# @primedx/plugin-access-tokens

Backstage frontend plugin for access token administration.

This package adds the `/admin/access-tokens` UI for creating, listing, auditing, and revoking service tokens. It also contributes the personal access token user-settings route and OAuth consent feature when that capability is enabled. It registers these routes in the new frontend system, but it does not provide the backend API or raw token auth handling on its own.

It also exports `personalAccessTokensAuthPlugin`, an optional frontend feature
that owns `/oauth2/authorize/:sessionId` for the personal access token
mint flow. Use it when you enable personal access tokens so users see a focused
"Create personal access token" consent screen.

A personal access token is a user-managed Backstage refresh token. It
is exchanged at `/api/auth/v1/token` for short-lived Backstage API
tokens that authenticate as the user principal; it is not sent directly
as an API bearer token.

## When To Use This Package

Install this package when you want access token management UI in your Backstage app.

Use it together with:

- `@primedx/plugin-access-tokens-backend` for the `/api/access-tokens/service` backend API and persistence
- `@primedx/plugin-access-tokens-node` for the backend auth handler and permission exports

## Install

Add the frontend plugin to your Backstage app workspace:

```bash
yarn --cwd packages/app add @primedx/plugin-access-tokens
```

## Minimum Working Setup

Register the frontend feature with `createApp({ features: [...] })`:

```ts
// packages/app/src/App.tsx
import { createApp } from '@backstage/frontend-defaults';
import accessTokensPlugin from '@primedx/plugin-access-tokens';

const app = createApp({
  features: [
    accessTokensPlugin,
  ],
});

export default app.createRoot();
```

The admin page is registered at `/admin/access-tokens`. When user
tokens are enabled, the package also contributes a `Personal Access
Tokens` tab to Backstage user settings at `/settings/personal-tokens`.
No extra route wiring is required in the default frontend setup.
If you prefer named imports, `accessTokensPlugin` is also exported by name.

For personal access tokens, register the companion consent feature before the main
plugin:

```ts
import accessTokensPlugin, {
  personalAccessTokensAuthPlugin,
} from '@primedx/plugin-access-tokens';

const app = createApp({
  features: [personalAccessTokensAuthPlugin, accessTokensPlugin],
});
```

Do not install another frontend feature that also registers `/oauth2`
unless your app intentionally handles that route conflict.

## Main Export

This package exports the frontend feature as:

- the default export
- `accessTokensPlugin`
- `personalAccessTokensAuthPlugin` for the personal-token OAuth consent route

It also exports `rootRouteRef`, `personalAccessTokensRouteRef`, and
`personalAccessTokensAuthRouteRef` for apps that need access to route references.

## What This Package Does Not Include

This package only provides the UI layer.

It does not:

- serve the `/api/access-tokens/service` endpoints
- store tokens
- verify raw service tokens in the backend auth layer
- grant permissions by itself

To make the page functional, wire the backend and node packages into your Backstage backend and add a permission policy that grants `access-tokens:service:read`, `access-tokens:service:write`, and `access-tokens:service:revoke` where appropriate.

## Learn More

- [Root README](../../README.md) for the package overview and install order
- [Install in an Existing App](../../docs/how-to/install.md) for full frontend and backend wiring
- [REST API Reference](../../docs/reference/rest-api.md) for the backend contract this UI consumes
- [Test the Plugin](../../docs/how-to/test.md) for post-install validation
