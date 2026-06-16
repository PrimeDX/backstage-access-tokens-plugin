# @primedx/plugin-access-tokens

## 0.2.1

### Patch Changes

- a20b704: Export `UserTokensPage` and `UserTokensSettingsTab` from the frontend plugin public API.

## 0.2.0

### Minor Changes

- 6824713: Add self-service personal access tokens at `/settings/personal-tokens`. Users see only their own tokens, can mint new ones through a same-tab OAuth flow with a show-once dialog, and can revoke active tokens. The UI is registered as a `Personal Access Tokens` tab in Backstage user settings, while admin service-token management remains at `/admin/access-tokens`; the underlying mechanism is the backend's personal-access-token capability (RFC 6749 + RFC 7591 + RFC 7009).

  The package also exports `personalAccessTokensAuthPlugin`, a companion frontend feature that registers `/oauth2/authorize/:sessionId` and renders focused personal-token consent copy for the mint flow.

### Patch Changes

- c5ee94c: Harden service-token admin UI group readiness for smoke stability during cold harness startup.
- 8429436: Migrate package licensing metadata from BUSL-1.1 to Apache-2.0 and align repository license documentation.
- c667e0a: Refresh package README guidance for npm consumers with clearer install context,
  minimum setup examples, and package-specific export notes.
- 54efb95: Align package manifests, imports, and documentation on the final access-tokens package names before first publish.
- 8e9bfb6: Update package descriptions and documentation to use backstage-access-tokens-plugin as the canonical repository name.
