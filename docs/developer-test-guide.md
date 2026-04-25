# Developer Test Guide

Audience: maintainers working on unpublished changes to this plugin.

Use this guide when you need fast, repeatable verification in a local Backstage harness before publishing new package versions.

By the end of this guide you should be able to answer:

- does the plugin still work in a real Backstage app
- do local `file:` installs still behave correctly
- does the primary create -> audit -> revoke flow still work end to end

For the adopter experience, use the [Tutorial](tutorial.md) or [Getting Started](getting-started.md). For the broader post-install validation path, use the [Testing Guide](testing.md).

## What This Guide Covers

- validating this repository before integration
- maintaining a reusable local Backstage harness
- running the API smoke path with `scripts/test-api.sh`
- running the Playwright UI smoke path
- revalidating local `file:` installs in a fresh app when needed

The canonical behavior for this guide matches:

- [REST API Reference](api.md)
- [Testing Guide](testing.md)
- [Contract Decisions](contract-decisions.md)

## Prerequisites

- Node 22
- Yarn
- `jq`
- `curl`
- this plugin repository cloned locally
- a local Backstage harness app that you can start and reconfigure

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

## 1. Verify This Repo First

From this repository:

```bash
cd /path/to/backstage-service-token-plugin
npm test
npm run pack:dry-run
```

Expected:

- all tests pass
- all three packages pack successfully in dry-run mode

If this fails, fix the plugin repository before moving on to harness validation.

## 2. Prepare a Reusable Local Harness

Use any local Backstage app that you can restart quickly and modify safely. The harness should be configured to match the documented contract.

Before starting the harness, verify:

- `serviceTokens.admin.userEntityRefs` grants the guest or test user the service token permissions
- `serviceTokens.cacheTtlSeconds: 0` is set in local config if you want deterministic revocation checks
- the catalog includes at least one group you can use for token creation, such as `group:default/platform`
- your harness can start both backend and frontend locally

Then start the harness:

```bash
cd /path/to/your-backstage-app
yarn start
```

Expected:

- frontend serves on `http://localhost:3000`
- backend serves on `http://localhost:7007`
- startup completes without plugin registration or permission-policy errors

## 3. Run the API Smoke Path

With the harness running, execute the repository API smoke script:

```bash
cd /path/to/backstage-service-token-plugin
npm run test:api-script -- http://localhost:7007
```

Expected:

- guest token acquisition succeeds
- scope listing succeeds
- token creation returns `201` with a one-time `rawToken`
- the raw token authenticates against the Catalog API
- audit responses use `{ "events": [...] }`
- revoke returns `204`
- revoked raw tokens are rejected with `401`
- unauthenticated create is rejected with `401`

If this path fails, treat it as a contract, config, or harness issue before debugging Playwright.

## 4. Run the Playwright UI Smoke Path

With the harness already running:

```bash
cd /path/to/backstage-service-token-plugin
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui-smoke
```

Optional headed run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui-smoke:headed
```

Expected:

- the page loads
- the create dialog succeeds for a unique token
- the success dialog shows a raw token once
- the audit dialog shows `created`
- revoke succeeds
- the table shows `Revoked`
- the audit dialog shows newest-first ordering after revoke

CI now runs this path automatically in the `CI / ui-smoke` job by installing `e2e/harness` dependencies and using Playwright `webServer` to start/wait for the harness before running the same smoke command. When CI fails, download `ui-smoke-artifacts` and review `playwright-report` and `test-results` first, then check the `Run UI smoke test` step logs for Playwright `webServer` startup output.

## 5. Revalidate Local `file:` Installs in a Fresh App

Use this path when you want to prove unpublished package changes still work in a newly scaffolded Backstage app.

Create a fresh app:

```bash
source ~/.nvm/nvm.sh
nvm use 22
cd /tmp
npx @backstage/create-app@latest
```

Move into the app and install dependencies:

```bash
cd /tmp/service-token-dev-test
yarn install
```

Then install the plugin packages from local folders:

```bash
yarn --cwd packages/backend add \
  @adriandantas/plugin-service-tokens-node@file:/path/to/backstage-service-token-plugin/packages/plugin-service-tokens-node

yarn --cwd packages/backend add \
  @adriandantas/plugin-service-tokens-backend@file:/path/to/backstage-service-token-plugin/packages/plugin-service-tokens-backend

yarn --cwd packages/app add \
  @adriandantas/plugin-service-tokens@file:/path/to/backstage-service-token-plugin/packages/plugin-service-tokens
```

If your app needs a root `resolutions` entry so the local node package is used consistently, add it deliberately and keep any existing values intact.

After install, wire the app to match the documented tutorial contract:

- register the backend plugin
- register the service token auth handler module
- register the frontend plugin in `createApp({ features: [...] })`
- configure admin users and, if needed, `serviceTokens.cacheTtlSeconds: 0` for deterministic revocation checks

Then run the same API and UI smoke paths.

## 6. What to Record When Something Fails

Capture enough detail to tell whether the issue belongs to this repository, the harness app, or the local installation flow:

- the exact command that failed
- backend and frontend logs
- whether the failure reproduced in the reusable harness, a fresh app, or both
- whether the mismatch is in behavior, docs, or packaging
- whether the failure affects the public contract in [Contract Decisions](contract-decisions.md)

## Recommended Maintainer Loop

For day-to-day iteration:

1. Make the plugin change in this repository.
2. Run `npm test`.
3. Run `npm run pack:dry-run` if package contents may have changed.
4. Refresh the local harness dependencies if you are using local `file:` installs.
5. Start or restart the harness.
6. Run `npm run test:api-script -- http://localhost:7007`.
7. Run `PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui-smoke`.

That sequence gives quick confidence in both the public contract and the primary admin UI flow before release work begins.
