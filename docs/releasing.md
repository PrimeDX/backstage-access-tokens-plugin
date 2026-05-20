# Releasing to npm

Audience: maintainers publishing new package versions from this repository.

Use this guide after code, tests, and documentation are already aligned and ready to ship.

This repository publishes three public scoped packages:

- `@primedx/plugin-access-tokens`
- `@primedx/plugin-access-tokens-backend`
- `@primedx/plugin-access-tokens-node`

## Prerequisites

- Node.js 22
- An npm account with 2FA enabled
- `npm login` completed locally

Verify the active npm identity:

```bash
npm whoami
```

## Automated GitHub flow

GitHub Actions now owns the normal release lifecycle:

1. Contributor PRs run the `CI` workflow on every pull request and push to `main`.
2. `Changeset Required` enforces the rule that pull requests touching the published package surface include a Changeset.
3. `Dependency Review` reports pull request dependency risk changes as an informational signal.
4. `CodeQL` analyzes the repository on pull requests, pushes to `main`, and a weekly schedule.
5. After a PR merges to `main`, the `Release PR` workflow opens or updates a `Version Packages` pull request with the pending version bumps.
6. When that reviewed release PR is merged into `main`, the `Publish` workflow reruns verification, confirms the merge contains Changesets-managed package version bumps, publishes the changed packages to npm, and pushes the generated release tags back to GitHub.
7. The `CI` workflow now includes a required `ui-smoke` job that starts the in-repo harness and runs `npm run test:ui-smoke` on pull requests and `main` pushes.
8. The `Manual UI Smoke` workflow remains available as a maintainer-triggered run for a reachable external harness URL when ad-hoc validation is needed.

This keeps versioning reviewable while still allowing hands-off publication after approval.

## Local dependency preflight before PR

Before opening or updating a pull request, run the local dependency audit commands from the repository root:

```bash
npm run security:ci
npm run security:changed
```

`security:ci` is the branch-protection mirror:

- `security:publishable` compares publishable dependency advisories to `origin/main` and fails on newly introduced `moderate+`
- `security:harness` audits `e2e/harness` at `high+`

Use this for day-to-day iteration. It runs dependency auditing when lockfiles changed (`package-lock.json` or `e2e/harness/yarn.lock`) and skips when they did not.

Current behavior:

- `security:changed` is a diff-aware guard for `e2e/harness/yarn.lock`
- it compares `high` / `critical` advisories in the current branch against `origin/main`
- it fails only when new `high` / `critical` advisories are introduced
- it skips when the harness lockfile did not change

When you need a full audit regardless of lockfile diffs:

```bash
npm run security:check
```

These commands do not replace GitHub `Dependency Review`, but they shorten feedback loops by catching issues locally before PR checks run.

## CI/CD flow at a glance

```mermaid
flowchart LR
  A["Contributor PR<br/>code + docs + tests + changeset"] --> B["Pull Request opened or updated"]
  B --> C["CI<br/>npm run ci"]
  B --> D["Changeset Required<br/>release intent gate"]
  B -. "signal" .-> E["Dependency Review<br/>dependency risk signal"]
  B --> M["CodeQL<br/>static security analysis"]
  C --> F{"PR merged to main?"}
  D --> F
  M --> F
  F -- "yes" --> G["Release PR workflow<br/>open/update 'Version Packages' PR"]
  G --> H["Maintainer reviews version bumps<br/>changelog + package alignment"]
  H --> I{"Release PR merged?"}
  I -- "yes" --> J["Publish workflow<br/>rerun verify + changeset publish"]
  J --> K["npm packages published<br/>with provenance + pushed tags"]
  B --> N["CI ui-smoke job<br/>Playwright against in-repo harness"]
  B -. "optional" .-> L["Manual UI Smoke workflow_dispatch<br/>Playwright against reachable harness"]
```

The important split is:

- PR workflows answer "is this safe to merge?"
- The release PR answers "are these the right versions to ship?"
- The publish workflow answers "can the reviewed release be published reproducibly?"
- Release tags are pushed only after a successful publish run reports published packages
- Ordinary feature merges to `main` must not publish packages; they only refresh the release PR state

The Changeset gate is intentionally scoped to shipped package files, not every repo change. It requires a Changeset for:

- `packages/*/package.json`
- `packages/*/README.md`
- files listed in each package's published `files` array, including shipped runtime source and published `.d.ts`

It does not require a Changeset for:

- `docs/**`
- `.github/**`
- root maintainer files such as `CONTRIBUTING.md`, `mkdocs.yml`, and the root `README.md`
- tests, Storybook stories, fixtures, and other package-local files that are not shipped

## Required repository settings

- Default branch: `main`
- Branch protection on `main` so CI must pass before merge
- Required status checks on pull requests: `CI / verify`, `CI / security-publishable`, `CI / security-harness`, `CI / ui-smoke`, `Changeset Required`, and `CodeQL`
- `NPM_TOKEN` configured in repository or organization GitHub Actions secrets
- npm package ownership configured for the `@adriandantas` scope
- GitHub code scanning enabled so CodeQL results are visible in the Security tab

The publish workflow uses npm provenance via `changeset publish --provenance`, so it also requires GitHub Actions OIDC support.

Docs publishing remains intentionally out of scope for this automation pass. If GitHub Pages or another docs deployment is added later, it should use a separate workflow rather than being coupled to npm publication.

Risk-tier policy used by required checks:

- publishable plugin surface (`packages/*`): block on `moderate+`
- test harness surface (`e2e/harness`): block on `high+`
- `Dependency Review` stays visible for triage and weekly cleanup planning, but is not a merge blocker

## CI and manual UI smoke expectations

`CI / ui-smoke` is the default browser gate for pull requests. It installs root and harness dependencies, then runs the smoke test with Playwright-managed harness startup/readiness via `webServer`:

- `PLAYWRIGHT_HARNESS_DIR=e2e/harness`
- `PLAYWRIGHT_BASE_URL=http://localhost:3000`
- `PLAYWRIGHT_USE_SYSTEM_CHROME=false`

When the job fails, review uploaded artifacts (`ui-smoke-artifacts`) including:

- `playwright-report`
- `test-results`

Troubleshooting notes:

- If startup fails before tests run, inspect the `Run UI smoke test` step logs for Playwright `webServer` output.
- Confirm `cd e2e/harness && yarn install --immutable` succeeded in the `Install harness dependencies` step.

`Manual UI Smoke` remains intentionally maintainer-triggered and non-blocking. Use it when you want browser validation against a real external Backstage harness without making external harness health a merge requirement.

Before dispatching the workflow, confirm the target harness:

- is reachable from GitHub Actions at the supplied `base_url`
- has the service token plugin installed and the admin route available
- includes catalog data and auth/permission configuration needed for the create, audit, and revoke path
- uses `accessTokens.service.cacheTtlSeconds: 0` when you need deterministic revoked-token rejection timing during the smoke flow

## Prepare a release

For normal releases, the maintainer workflow is:

1. Merge feature and fix PRs that include their Changesets.
2. Review the generated `Version Packages` PR for version bumps, internal dependency updates, and changelog accuracy.
3. Merge the release PR.
4. Confirm the `Publish` workflow succeeds and the packages appear on npm.

You can still use the local commands below to inspect or debug the release process before merging.

Install dependencies and run the full verification suite:

```bash
yarn install
npm run ci
```

Create a changeset that describes the release:

```bash
npm run changeset
```

Version the packages and changelog:

```bash
npx changeset version
```

Review the resulting package versions, changelog updates, and published package contents:

```bash
npm run pack:dry-run
```

Before publishing, confirm documentation and compatibility guardrails for this release:

- Auth/authz behavior changes are documented (including enforced vs metadata-only semantics)
- Security-significant or breaking changes include migration notes and operator actions
- Public API or integration pattern changes are called out in release notes/changelogs
- Open security findings from `Dependency Review` and `CodeQL` are triaged before release
- `Publish` is expected to skip cleanly when `NPM_TOKEN` is not configured, and to push tags only after a successful publish

## Manual publish fallback

GitHub Actions should be the default publish path. Use manual publishing only when you need to recover from a failed automation run or validate the process locally.

Publish all changed packages with public scoped access:

```bash
npx changeset publish
```

For a first manual publish of an individual package, use:

```bash
npm publish --access public
```

Run that command from the package directory you want to publish.

## Post-publish checks

- Confirm each package page exists on npm
- Confirm the package README renders correctly
- Confirm the install snippets in `README.md` still match the published versions
- Confirm the docs still describe the current auth, permission, and scope-enforcement behavior accurately
