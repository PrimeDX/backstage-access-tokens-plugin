# @adriandantas/plugin-service-tokens

Frontend Backstage plugin for managing service tokens from `/admin/service-tokens`.

## Install

```bash
yarn --cwd packages/app add @adriandantas/plugin-service-tokens
```

## Usage

```ts
import serviceTokensPlugin from '@adriandantas/plugin-service-tokens';

app.addFeatures([serviceTokensPlugin]);
```

See the repository root documentation for complete setup, including the backend plugin and auth handler module.
