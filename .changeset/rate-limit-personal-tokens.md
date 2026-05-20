---
'@primedx/plugin-access-tokens-backend': patch
---

Add an in-router rate limiter (60 req/min/IP) to the personal-access-token endpoints under `/api/access-tokens/personal/*` as defense-in-depth for credential issuance and management. Operators should still apply rate-limiting at the reverse proxy or API gateway.
