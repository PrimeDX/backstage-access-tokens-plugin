# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-05

### Added

- Initial public package baseline for service token management in Backstage:
  - Frontend admin UI (`/admin/service-tokens`)
  - Backend REST API (`/api/service-tokens`)
  - External auth handler module (`backstage-service-token`)
  - Audit logging and revocation flows
  - Configurable cache TTL and token lifetime settings
  - Built-in + custom scope catalogue support
  - Storybook coverage for UI components

### Changed

- License changed to Business Source License 1.1 (BUSL-1.1).
- Added contributor guide and publication-readiness documentation updates.
