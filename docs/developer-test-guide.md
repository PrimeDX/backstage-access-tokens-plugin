# Developer Test Guide

This guide is the fastest reliable way to validate the plugin locally **before the packages are published to npm**.

Use it when you are changing the plugin itself and want a maintainer-focused answer to one of these questions:

- Does the plugin still work in a real Backstage app?
- Do local `file:` installs still behave correctly before publication?
- Does the admin UI still support the core create → audit → revoke flow?

If you are validating the plugin as an adopter, start with the [Tutorial](tutorial.md). If you want the broad end-to-end operator flow after installation, use the [Testing Guide](testing.md). This guide is for maintainers iterating on unpublished changes.

---

## What This Guide Covers

- Node 22 verification in this repo
- Local `file:` installs into a Backstage app
- A fast repeat harness using `my-portal`
- API smoke coverage with `scripts/test-api.sh`
- UI smoke coverage with Playwright

The canonical contract for this guide matches:

- [REST API Reference](api.md)
- [Testing Guide](testing.md)
- [Contract Decisions](contract-decisions.md)

That means:

- audit responses use `events` with `event`, `actor`, `metadata`, and `occurredAt`
- audit events are returned newest-first
- deterministic local revocation checks rely on `serviceTokens.cacheTtlSeconds: 0`

---

## When To Use This Guide

Use this guide instead of the main tutorial when:

- you are validating unpublished package changes
- you need local `file:` installs instead of npm packages
- you want a repeatable maintainer loop against `/Users/adrian/src/my-portal`
- you want both API and UI smoke checks without re-scaffolding a new app every time

Use the tutorial instead when:

- you want the adopter experience from scratch
- you are checking docs readability for platform engineers
- you want the simplest end-user install story

---

## Prerequisites

Make sure these are available:

- Node `22`
- Yarn
- `jq`
- `curl`
- this plugin repo cloned locally
- the local harness app at `/Users/adrian/src/my-portal`

Check the toolchain:

```bash
node --version
yarn --version
jq --version
curl --version | head -n 1
```

If you use `nvm`:

```bash
source ~/.nvm/nvm.sh
nvm use 22
```

Expected:

- `node --version` reports `v22.x`
- Yarn is available
- `jq` and `curl` are installed

---

## 1. Verify This Repo First

From this repo:

```bash
cd /path/to/backstage-service-token-plugin
npm test
npm run pack:dry-run
```

Expected:

- all tests pass
- all three packages pack successfully in dry-run mode

If this fails, stop and fix the plugin repo before moving on.

---

## 2. Fast Repeat Path — Use `my-portal`

This is the recommended maintainer loop after the first integration is working.

Why:

- it is already aligned to the tutorial contract
- it uses local `file:` dependencies from this repo
- it is fast to re-run after plugin changes

Before starting the harness, confirm these behaviors in `/Users/adrian/src/my-portal`:

- `backend.auth.externalAccess` includes `backstage-service-token`
- `serviceTokens.admin.userEntityRefs` includes `user:development/guest`
- `serviceTokens.cacheTtlSeconds: 0` is set in local config
- `group:default/platform` exists in `examples/org.yaml`
- local `file:` dependencies have been refreshed with `yarn install`

Then start the harness:

```bash
cd /Users/adrian/src/my-portal
yarn start
```

Expected:

- frontend serves on `http://localhost:3000`
- backend listens on `http://localhost:7007`
- no startup error occurs for the service token plugin

---

## 3. Run the API Smoke Path

From this repo, with `my-portal` running:

```bash
cd /path/to/backstage-service-token-plugin
npm run test:api-script -- http://localhost:7007
```

Expected:

- guest token acquisition succeeds
- scope listing succeeds
- token creation returns `201` and a one-time `rawToken`
- raw token authenticates against the Catalog API
- audit log returns an `events` array
- revoke returns `204`
- revoked raw token is rejected with `401`
- unauthenticated create is rejected with `401`

If this fails, treat it as a contract or harness issue first, not a Playwright issue.

---

## 4. Run the Playwright UI Smoke Path

With `my-portal` already running:

```bash
cd /path/to/backstage-service-token-plugin
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui-smoke
```

Optional:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui-smoke:headed
```

Expected:

- the service token page loads
- the create dialog works for a unique token
- the success dialog shows the raw token once
- the audit dialog shows `created`
- revoke succeeds
- the table shows `Revoked`
- the audit dialog shows newest-first ordering: `revoked`, then `created`

This smoke test intentionally covers only the primary happy path. It does not yet validate every permission or error branch.

---

## 5. Fresh App Path — Revalidate Local `file:` Installs

Use this path when you want to prove the plugin still works in a newly scaffolded Backstage app before publication.

Create a fresh app:

```bash
source ~/.nvm/nvm.sh
nvm use 22
cd /tmp
npx @backstage/create-app@latest
```

Move into the new app:

```bash
cd /tmp/service-token-dev-test
```

Reinstall under Node 22:

```bash
yarn install
```

Expected:

- the clean app starts before plugin changes
- Node 22 is the active runtime for native modules

---

## 6. Install the Plugin From Local Package Folders

Use this plugin repo path as an example:

```text
/path/to/backstage-service-token-plugin
```

Add a root Yarn resolution before backend install so the local node package is used consistently:

```json
"resolutions": {
  "@types/react": "^18",
  "@types/react-dom": "^18",
  "@adriandantas/plugin-service-tokens-node@npm:^0.1.0": "file:/path/to/backstage-service-token-plugin/packages/plugin-service-tokens-node"
}
```

If `resolutions` already exists, add the service-token entry rather than replacing existing values.

Then run:

```bash
yarn install
```

Install the plugin packages with local `file:` paths:

```bash
yarn --cwd packages/backend add \
  @adriandantas/plugin-service-tokens-node@file:/path/to/backstage-service-token-plugin/packages/plugin-service-tokens-node

yarn --cwd packages/backend add \
  @adriandantas/plugin-service-tokens-backend@file:/path/to/backstage-service-token-plugin/packages/plugin-service-tokens-backend

yarn --cwd packages/app add \
  @adriandantas/plugin-service-tokens@file:/path/to/backstage-service-token-plugin/packages/plugin-service-tokens
```

Then run:

```bash
yarn install
```

Expected:

- installs succeed
- peer warnings may appear
- the local packages are materialized into the app successfully

---

## 7. Wire the Fresh App to Match the Tutorial Contract

Use the [Tutorial](tutorial.md) and [Getting Started](getting-started.md) documents as the canonical wiring reference.

For parity, the fresh app should end up with:

- backend plugin registration
- auth handler registration
- custom permission policy
- `backend.auth.externalAccess` for `backstage-service-token`
- `serviceTokens.admin.userEntityRefs` including `user:development/guest`
- `serviceTokens.cacheTtlSeconds: 0` in local config
- `group:default/platform` present in the catalog
- frontend registration of `serviceTokensPlugin`

Expected:

- `/admin/service-tokens` loads without `401` or `403`
- API and UI smoke paths behave the same way as the maintainer harness

---

## 8. What To Record If Something Fails

Capture:

- the exact command you ran
- the exact error output
- whether the failure was in this repo, `my-portal`, or a fresh app
- whether the failure was in the API smoke path or the Playwright smoke path
- whether the failure was contract-related, install-related, or harness-related

That keeps maintainer debugging grounded in facts instead of assumptions.

---

## Recommended Maintainer Loop

For day-to-day iteration:

1. Change the plugin
2. Run `npm test`
3. Refresh `my-portal` with `yarn install` if package contents changed
4. Start `my-portal`
5. Run `npm run test:api-script -- http://localhost:7007`
6. Run `PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui-smoke`

That gives quick confidence in both contract behavior and the main admin UI path before publication work begins.
