---
'@primedx/plugin-service-tokens-backend': minor
---

Internal scaffolding for the user-tokens capability: AES-256-GCM encryption helpers (`encryptRefreshToken` / `decryptRefreshToken` / `decodeEncryptionKey`) and a typed config reader (`readUserTokensConfig`, `missingAuthBackendFlags`) for the `serviceTokens.userTokens.*` block in `app-config.yaml`. Not yet exposed via public exports.
