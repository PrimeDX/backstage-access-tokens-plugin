---
'@primedx/plugin-access-tokens': minor
---

Add self-service personal access tokens at `/settings/personal-tokens`. Users see only their own tokens, can mint new ones through a same-tab OAuth flow with a show-once dialog, and can revoke active tokens. The UI is registered as a `Personal Access Tokens` tab in Backstage user settings, while admin service-token management remains at `/admin/access-tokens`; the underlying mechanism is the backend's personal-access-token capability (RFC 6749 + RFC 7591 + RFC 7009).

The package also exports `personalAccessTokensAuthPlugin`, a companion frontend feature that registers `/oauth2/authorize/:sessionId` and renders focused personal-token consent copy for the mint flow.
