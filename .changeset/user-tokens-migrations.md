---
'@primedx/plugin-access-tokens-backend': minor
---

Add migrations for the personal-access-token capability: `personal_access_tokens` (with AES-GCM ciphertext columns for the stored refresh token), `personal_access_token_audit_log`, and the singleton `personal_access_tokens_dcr_client` table. Existing service-token tables are unchanged. Migrations remain idempotent.
