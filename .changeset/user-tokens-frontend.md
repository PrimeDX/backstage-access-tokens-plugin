---
'@primedx/plugin-service-tokens': minor
---

Add self-service personal access tokens at `/settings/personal-tokens`. Users see only their own tokens, can mint new ones through a same-tab OAuth flow with a show-once dialog, and can revoke active tokens. The UI is registered as a `Personal Access Tokens` tab in Backstage user settings, while admin service-token management remains at `/admin/service-tokens`; the underlying mechanism is the backend's user-tokens capability (RFC 6749 + RFC 7591 + RFC 7009).

The package also exports `userTokensAuthPlugin`, a companion frontend feature that registers `/oauth2/authorize/:sessionId` and renders focused personal-token consent copy for the mint flow.
