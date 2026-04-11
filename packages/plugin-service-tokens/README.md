# @adriandantas/plugin-service-tokens

Frontend Backstage plugin for managing service tokens from `/admin/service-tokens`.

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

See the repository root documentation for complete setup, including the backend plugin and auth handler module.
