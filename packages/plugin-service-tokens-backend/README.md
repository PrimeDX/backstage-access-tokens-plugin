# @adriandantas/plugin-service-tokens-backend

Backend Backstage plugin for creating, listing, auditing, and revoking service tokens.

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

See the repository root documentation for full install, configuration, and permission policy wiring.
