# @adriandantas/plugin-service-tokens-node

Shared Backstage node library for the service token auth handler, permission exports, and verification utilities.

This package is primarily used by the backend plugin, but it also exposes the pieces you need when wiring auth and permission policies.

## Install

```bash
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-node
```

## Usage

Register the auth handler module in your backend:

```ts
import { serviceTokenHandlerModule } from '@adriandantas/plugin-service-tokens-node';

backend.add(serviceTokenHandlerModule);
```

This package also exports the service token permission definitions used in permission policies:

- `serviceTokensReadPermission`
- `serviceTokensWritePermission`
- `serviceTokensRevokePermission`

For the complete installation flow and backend integration guidance, see the root [README](../../README.md) and [Getting Started guide](../../docs/getting-started.md).
