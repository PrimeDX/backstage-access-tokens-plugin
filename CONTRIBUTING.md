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

## Pull request checklist

- [ ] Tests pass locally
- [ ] Docs updated (`README.md` + `docs/*` as needed)
- [ ] No internal-only files included in commits (`STATUS.md`)
- [ ] Commit messages follow Conventional Commits

`AGENTS.md` is an intentional tracked repo document for coding agents and should remain in version control.

## Reporting issues

Please open an issue with:

- Backstage version
- Node version
- Plugin package versions
- Reproduction steps
- Relevant logs/errors
