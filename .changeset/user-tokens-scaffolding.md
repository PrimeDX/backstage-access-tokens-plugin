---
'@primedx/plugin-access-tokens-backend': minor
---

Internal scaffolding for the personal-access-token capability: AES-256-GCM encryption helpers (`encryptRefreshToken` / `decryptRefreshToken` / `decodeEncryptionKey`) and a typed config reader (`readUserTokensConfig`, `missingAuthBackendFlags`) for the `accessTokens.personal.*` block in `app-config.yaml`. Not yet exposed via public exports.
