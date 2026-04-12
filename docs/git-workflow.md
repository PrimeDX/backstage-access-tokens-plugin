# Git Workflow

Audience: maintainers and contributors making changes in this repository.

Use GitHub Flow for day-to-day work in this project. Keep it lightweight, keep `main` releasable, and use pull requests to review contract, docs, and test impact before merge.

## Branching

Create each branch from `main`.

Use this naming pattern:

```text
<type>/<short-topic>
```

Examples:

- `feat/add-token-audit-filter`
- `fix/revoke-cache-ttl-docs`
- `docs/update-install-example`
- `test/api-smoke-harness`
- `chore/bump-backstage-deps`

Choose short, readable topics that describe one reviewable change.

Automated agents should follow the same pattern and should not prepend tool-specific prefixes such as `codex/`.

## Recommended Loop

1. Update your local `main`.
2. Create a branch for one change.
3. Make the smallest reviewable set of edits that keeps code, docs, and tests aligned.
4. Run the relevant validation commands before opening or updating the pull request.
5. Open a pull request against `main`.
6. Merge after review and successful validation.

## Pull Request Expectations

Keep pull requests focused and easy to review:

- use Conventional Commits for local commit history
- summarize any contract change explicitly
- list the verification commands you actually ran
- update docs when behavior, workflow, or configuration changed
- avoid mixing unrelated fixes into the same branch

If a change touches auth, permissions, audit fields, revoke behavior, or installation wiring, verify the implementation still matches the canonical docs:

- [README](../README.md)
- [Contract Decisions](contract-decisions.md)
- [REST API Reference](api.md)
- [Testing Guide](testing.md)
- [Developer Test Guide](developer-test-guide.md)

## Keeping Branches Current

If `main` moves while your branch is open, update your branch before merge so final review reflects current behavior.

Prefer a clean history and avoid long-lived branches when possible. Small branches reduce drift and make contract review easier.
