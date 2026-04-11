# @adriandantas/plugin-service-tokens-backend

Backend Backstage plugin for creating, listing, auditing, and revoking service tokens.

This package provides:

- the `/api/service-tokens` REST API
- database persistence and migrations
- permission checks for read, write, and revoke operations

It should be installed together with `@adriandantas/plugin-service-tokens-node`, which supplies the external auth handler module used to validate raw service tokens.

## Install

```bash
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-backend
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-node
```

## Usage

```ts
import { serviceTokensPlugin } from '@adriandantas/plugin-service-tokens-backend';
import { serviceTokenHandlerModule } from '@adriandantas/plugin-service-tokens-node';

backend.add(serviceTokensPlugin);
backend.add(serviceTokenHandlerModule);
```

This package expects the Backstage permission framework to be installed and a permission policy to grant `service-tokens:read`, `service-tokens:write`, and `service-tokens:revoke`.

For the full installation flow, policy wiring, and config reference, see the root [README](../../README.md) and [Getting Started guide](../../docs/getting-started.md).
