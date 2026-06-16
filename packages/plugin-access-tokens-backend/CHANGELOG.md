# @primedx/plugin-access-tokens-backend

## 0.2.1

### Patch Changes

- 55abdfd: Add `repository` metadata to each package so npm provenance (OIDC trusted publishing) can validate the source repository during publish.
- Updated dependencies [55abdfd]
  - @primedx/plugin-access-tokens-node@0.2.1

## 0.2.0

### Minor Changes

- d34cfad: Add the user-tokens capability: a user-self-service flow that mints Backstage personal access tokens via the standard OAuth 2.0 + DCR pipeline (gated by `auth.experimentalDynamicClientRegistration.enabled` and `auth.experimentalRefreshToken.enabled`). Tokens authenticate as the user — when Alice mints a token and pastes it into her CI, every Backstage backend plugin sees the call as `user:default/alice`.

  Operationally:

  - `accessTokens.personal.encryptionKey` (base64 of 32 raw bytes) is required; the plugin refuses to mount the personal-access-token routes without it.
  - HTTP surface: `/api/access-tokens/personal/*` (mint, mint/callback, list, get, delete, audit).
  - Tokens are encrypted at rest with AES-256-GCM. The plugin DB never stores the refresh token in clear; revocation decrypts, calls RFC 7009 `/v1/revoke`, then wipes the ciphertext columns.

  Service-token behavior is unchanged.

- eaf2120: Add migrations for the personal-access-token capability: `personal_access_tokens` (with AES-GCM ciphertext columns for the stored refresh token), `personal_access_token_audit_log`, and the singleton `personal_access_tokens_dcr_client` table. Existing service-token tables are unchanged. Migrations remain idempotent.
- 8dcc142: Internal scaffolding for the personal-access-token capability: AES-256-GCM encryption helpers (`encryptRefreshToken` / `decryptRefreshToken` / `decodeEncryptionKey`) and a typed config reader (`readUserTokensConfig`, `missingAuthBackendFlags`) for the `accessTokens.personal.*` block in `app-config.yaml`. Not yet exposed via public exports.

### Patch Changes

- 8429436: Migrate package licensing metadata from BUSL-1.1 to Apache-2.0 and align repository license documentation.
- c667e0a: Refresh package README guidance for npm consumers with clearer install context,
  minimum setup examples, and package-specific export notes.
- 54efb95: Align package manifests, imports, and documentation on the final access-tokens package names before first publish.
- 1cfa983: Add an in-router rate limiter (60 req/min/IP) to the personal-access-token endpoints under `/api/access-tokens/personal/*` as defense-in-depth for credential issuance and management. Operators should still apply rate-limiting at the reverse proxy or API gateway.
- 8e9bfb6: Update package descriptions and documentation to use backstage-access-tokens-plugin as the canonical repository name.
- Updated dependencies [8429436]
- Updated dependencies [c667e0a]
- Updated dependencies [54efb95]
- Updated dependencies [8e9bfb6]
- Updated dependencies [bbd8e42]
  - @primedx/plugin-access-tokens-node@0.2.0
