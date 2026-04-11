# Releasing to npm

Audience: maintainers publishing new package versions from this repository.

Use this guide after code, tests, and documentation are already aligned and ready to ship.

This repository publishes three public scoped packages:

- `@adriandantas/plugin-service-tokens`
- `@adriandantas/plugin-service-tokens-backend`
- `@adriandantas/plugin-service-tokens-node`

## Prerequisites

- Node.js 22
- An npm account with 2FA enabled
- `npm login` completed locally

Verify the active npm identity:

```bash
npm whoami
```

## Prepare a release

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

## Publish

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
