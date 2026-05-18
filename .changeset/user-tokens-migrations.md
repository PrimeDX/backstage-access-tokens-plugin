---
'@primedx/plugin-service-tokens-backend': minor
---

Add migrations for the user-token capability: `user_tokens` (with AES-GCM ciphertext columns for the stored refresh token), `user_token_audit_log`, and the singleton `user_tokens_dcr_client` table. Existing `service_tokens` and `service_token_audit_log` tables are unchanged. Migrations remain idempotent.
