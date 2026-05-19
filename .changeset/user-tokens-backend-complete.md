---
'@primedx/plugin-service-tokens-backend': minor
---

Add the user-tokens capability: a user-self-service flow that mints Backstage personal access tokens via the standard OAuth 2.0 + DCR pipeline (gated by `auth.experimentalDynamicClientRegistration.enabled` and `auth.experimentalRefreshToken.enabled`). Tokens authenticate as the user — when Alice mints a token and pastes it into her CI, every Backstage backend plugin sees the call as `user:default/alice`.

Operationally:

- `serviceTokens.userTokens.encryptionKey` (base64 of 32 raw bytes) is required; the plugin refuses to mount the user-tokens routes without it.
- HTTP surface: `/api/service-tokens/personal/tokens/*` (mint, mint/callback, list, get, delete, audit).
- Tokens are encrypted at rest with AES-256-GCM. The plugin DB never stores the refresh token in clear; revocation decrypts, calls RFC 7009 `/v1/revoke`, then wipes the ciphertext columns.

Service-tokens behavior is unchanged.
