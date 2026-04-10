# @adriandantas/plugin-service-tokens-node

Shared Backstage node library that exposes the service token auth handler module and supporting primitives.

## Install

```bash
yarn --cwd packages/backend add @adriandantas/plugin-service-tokens-node
```

## Usage

```ts
import { serviceTokenHandlerModule } from '@adriandantas/plugin-service-tokens-node';

backend.add(serviceTokenHandlerModule);
```

See the repository root documentation for the full installation flow and backend configuration requirements.
