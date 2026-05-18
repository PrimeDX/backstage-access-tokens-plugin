---
'@primedx/plugin-service-tokens': minor
---

Add a self-service personal access tokens page at `/settings/personal-tokens`. Users see only their own tokens, can mint new ones through a popup OAuth flow with a show-once dialog, and can revoke active tokens. The page is registered as a sibling of the existing admin service-tokens page; the underlying mechanism is the backend's user-tokens capability (RFC 6749 + RFC 7591 + RFC 7009).
