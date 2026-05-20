# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- End-to-end tutorial covering install, configuration, API validation, and UI validation.
- Granular service token permissions:
  - `access-tokens:service:read`
  - `access-tokens:service:write`
  - `access-tokens:service:revoke`

### Changed

- License migrated from Business Source License 1.1 (BUSL-1.1) to Apache License 2.0 (Apache-2.0).
- Package scope renamed from `@adriandantas/*` to `@primedx/*` before first publish.
- Token-management routes now authorize per action instead of using a single admin permission.
- Documentation and examples now describe the granular permission model throughout the project.

### Breaking

- `serviceAccessTokensReadPermission` is now a deprecated alias of `access-tokens:service:read`.
- Existing permission policies that check only `serviceAccessTokensReadPermission` will no longer grant create or revoke access until they are updated to allow `access-tokens:service:write` and `access-tokens:service:revoke`.

## [0.1.0] - 2026-04-05

### Added

- Initial public package baseline for service token management in Backstage:
  - Frontend admin UI (`/admin/access-tokens`)
  - Backend REST API (`/api/access-tokens/service`)
  - External auth handler module (`backstage-service-access-token`)
  - Audit logging and revocation flows
  - Configurable cache TTL and token lifetime settings
  - Built-in + custom scope catalogue support
  - Storybook coverage for UI components

### Changed

- License changed to Business Source License 1.1 (BUSL-1.1).
- Added contributor guide and publication-readiness documentation updates.
