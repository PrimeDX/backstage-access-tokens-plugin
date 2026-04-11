# Agent Guide

This file is a tracked repo document for coding agents working in this project.

## Project Purpose

This repository publishes a Backstage service-token plugin workspace with three packages:

- `@adriandantas/plugin-service-tokens` — frontend admin UI
- `@adriandantas/plugin-service-tokens-backend` — backend API and persistence
- `@adriandantas/plugin-service-tokens-node` — shared node utilities and auth handler module

The plugin manages long-lived, group-scoped service tokens with create, audit, and revoke flows.

## Canonical Sources

Read these first before making behavior changes:

1. `README.md`
2. `docs/contract-decisions.md`
3. `docs/api.md`
4. `docs/testing.md`
5. `docs/developer-test-guide.md`

When docs, tests, and implementation diverge, align changes to the canonical contract rather than preserving accidental drift.

## Contract Rules

Treat these as locked unless the public contract is intentionally changed across code, tests, and docs:

- Audit responses are `{ "events": [...] }`
- Audit event fields are `id`, `tokenId`, `event`, `actor`, `metadata`, and `occurredAt`
- Audit events are returned newest-first
- Revocation is bounded by `serviceTokens.cacheTtlSeconds`
- Immediate revoke rejection is only deterministic when the local harness sets `serviceTokens.cacheTtlSeconds: 0`
- Frontend installation examples should prefer `createApp({ features: [...] })`

## Working Rules

- Prefer Backstage-aligned, fact-driven changes over convenience shortcuts
- Be practical: prefer small, grounded edits over large speculative rewrites
- Avoid generating large chunks of code that are disconnected from the actual codebase, APIs, or documentation
- Do not invent public API behavior that conflicts with tests or canonical docs
- Treat tests as a major concern, not a cleanup step
- Update docs and tests together when behavior, contract, or workflow changes
- Keep documentation current whenever code, APIs, configuration, or maintainer workflow changes
- Write `README.md` and general user-facing documentation with the standards of an experienced open source technical writer for Backstage-style projects: clear audience-aware structure, practical examples, accurate installation and usage guidance, and concise explanations that help new adopters succeed quickly
- Add or update JSDoc where exported behavior, interfaces, or non-obvious logic need durable explanation
- Keep commits reviewable and grouped by change type
- Use Conventional Commits
- Do not casually rewrite `docs/contract-decisions.md`; only change it when the intended public contract changes
- When creating plans, prefer iterative and incremental steps that establish truth before building on later work

## Validation Expectations

Use `npm test` as the repo baseline.

When relevant to the change, also use:

- `scripts/test-api.sh` for API and auth smoke validation
- `npm run test:ui-smoke` for the primary admin UI create → audit → revoke path

Use a local Backstage integration harness for end-to-end validation. For recommended harness characteristics and maintainer workflow, follow `docs/developer-test-guide.md`.

If a change is not meaningfully tested, call that out explicitly rather than implying confidence.

## Pull Requests

PRs should:

- summarize contract changes explicitly
- list the verification commands that were actually run
- keep behavior, docs, and validation assets aligned

If a change affects auth, permissions, audit fields, revoke behavior, or install wiring, verify that the docs still match the implementation exactly.
