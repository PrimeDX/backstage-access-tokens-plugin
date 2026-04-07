# Backstage Service Token Plugin Docs

Welcome to the documentation for the **Backstage Service Token Plugin**.

This plugin provides:

- A backend API for creating, listing, and revoking service tokens
- An external auth handler so raw service tokens can authenticate against Backstage backend routes
- A frontend admin page at `/admin/service-tokens`

---

## Start here

- [Getting Started](getting-started.md) — install and wire the plugin into an existing Backstage app
- [Configuration Reference](configuration.md) — all `serviceTokens` config keys and defaults
- [REST API Reference](api.md) — request/response formats for all endpoints
- [Architecture](architecture.md) — package design, token lifecycle, and database model
- [Testing Guide](testing.md) — end-to-end API and UI test flows
- [Release Guide](releasing.md) — versioning and publishing the npm packages
- [Production Readiness](production-readiness.md) — group-based admin access, policy merging, cache tuning, audit retention
- [Scope Enforcement Runbook](runbooks/scope-enforcement.md) — optional operator guidance for consumer-driven enforcement

---

## Suggested reading order

1. Begin with [Getting Started](getting-started.md)
2. Tune settings in [Configuration Reference](configuration.md)
3. Integrate automation using [REST API Reference](api.md)
4. Dive deeper with [Architecture](architecture.md)
5. Validate your setup with [Testing Guide](testing.md)
6. Publish updates with [Release Guide](releasing.md)
7. Harden for production with the [Production Readiness Guide](production-readiness.md)
8. Optionally enforce token scopes with the [Scope Enforcement Runbook](runbooks/scope-enforcement.md)

---

## Documentation publishing roadmap

Documentation publishing follows a phased model:

1. Keep in-repo docs complete and decision-oriented.
2. Publish docs to GitHub Pages with minimal tooling first, then harden navigation/versioning.
3. Add operator runbooks/cookbooks for enforcement patterns and incident handling.
