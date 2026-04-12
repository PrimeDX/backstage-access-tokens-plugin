# Contributing to backstage-service-token-plugin

Thanks for your interest in contributing.

## Development prerequisites

- Node.js 22+
- A Backstage integration app for end-to-end verification

## Local setup

```bash
cd /path/to/backstage-service-token-plugin
nvm install 22
nvm use 22
yarn install
```

## Run tests

```bash
npm test
npm run test:backend
npm run test:node
npm run test:frontend
```

## Run Storybook

```bash
npm run storybook
```

## Verify published package contents

```bash
npm run pack:dry-run
```

## Contribution standards

- Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`...)
- Keep PRs small and focused
- Add/adjust tests for behavior changes
- Update docs whenever behavior, API, or config changes
- Add a Changeset when a PR changes the published package surface

## Pull request checklist

- [ ] Tests pass locally
- [ ] Docs updated (`README.md` + `docs/*` as needed)
- [ ] Changeset added when published package files or package metadata changed
- [ ] No internal-only files included in commits (`STATUS.md`)
- [ ] Commit messages follow Conventional Commits

## CI and releases

GitHub Actions now handles the release lifecycle in three layers:

- `CI` runs on every pull request and push to `main`, and verifies the canonical `npm run ci` lane
- `Changeset Required` runs on pull requests and enforces the documented rule that changes to the published package surface include a Changeset
- `Dependency Review` runs on pull requests and blocks risky dependency changes before merge
- `CodeQL` runs on pull requests, pushes to `main`, and a weekly schedule to surface static-analysis findings in GitHub Security
- `Release PR` runs on pushes to `main` and opens or updates a `Version Packages` pull request from pending Changesets
- `Publish` runs only when the reviewed `Version Packages` pull request is merged to `main`, reruns the verification suite, and publishes to npm only when package version bumps are present and `NPM_TOKEN` is configured

The intended merge flow is:

1. Open a feature or fix PR with code, docs, tests, and a Changeset.
2. Merge that PR into `main`.
3. Review and merge the auto-generated `Version Packages` release PR.
4. Let the `Publish` workflow release the new versions to npm.

Repository settings should enforce branch protection on `main` so `CI`, `Changeset Required`, `Dependency Review`, and `CodeQL` pass before merge.

The Changeset rule is intentionally narrow. A Changeset is required when a PR modifies shipped package files such as:

- `packages/*/package.json`
- `packages/*/README.md`
- source or `.d.ts` files that are included in the package `files` list

Docs, workflows, tests, stories, fixtures, and other non-published repo files do not need a Changeset. The detailed release contract lives in `docs/releasing.md`; keep that document authoritative if this workflow changes again.

`AGENTS.md` is an intentional tracked repo document for coding agents and should remain in version control.

## Reporting issues

Please open an issue with:

- Backstage version
- Node version
- Plugin package versions
- Reproduction steps
- Relevant logs/errors
