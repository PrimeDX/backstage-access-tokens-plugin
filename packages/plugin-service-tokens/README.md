# @adriandantas/plugin-service-tokens

Frontend Backstage plugin that adds the service token admin page at `/admin/service-tokens`.

Use this package together with:

- `@adriandantas/plugin-service-tokens-backend` for the REST API and persistence
- `@adriandantas/plugin-service-tokens-node` for the auth handler module used by the backend

## Install

```bash
yarn --cwd packages/app add @adriandantas/plugin-service-tokens
```

## Usage

```ts
import { createApp } from '@backstage/frontend-defaults';
import serviceTokensPlugin from '@adriandantas/plugin-service-tokens';

const app = createApp({
  features: [serviceTokensPlugin],
});

export default app.createRoot();
```

This package registers the UI. It does not provide the backend API on its own.

For the full installation flow, configuration, and permission policy wiring, see the root [README](../../README.md) and [Getting Started guide](../../docs/getting-started.md).
