# @primedx/plugin-access-tokens-node

## 0.2.1

### Patch Changes

- 55abdfd: Add `repository` metadata to each package so npm provenance (OIDC trusted publishing) can validate the source repository during publish.

## 0.2.0

### Minor Changes

- bbd8e42: Add personal-access-token permissions (`access-tokens:user:read`, `access-tokens:user:write`, `access-tokens:user:revoke`) and the user-token resource type constant, scaffolding the upcoming user-self-service personal access token capability. Service-token permissions are unchanged.

### Patch Changes

- 8429436: Migrate package licensing metadata from BUSL-1.1 to Apache-2.0 and align repository license documentation.
- c667e0a: Refresh package README guidance for npm consumers with clearer install context,
  minimum setup examples, and package-specific export notes.
- 54efb95: Align package manifests, imports, and documentation on the final access-tokens package names before first publish.
- 8e9bfb6: Update package descriptions and documentation to use backstage-access-tokens-plugin as the canonical repository name.
