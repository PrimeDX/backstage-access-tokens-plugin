# Spec Knowledge Base

This directory is not part of the Diataxis reader flow. It is an agent- and
maintainer-oriented knowledge base for quickly understanding project
architecture, implementation choices, and verification history without reading
the whole codebase first.

Use these documents when you need implementation context before changing code,
reviewing behavior, or reconciling docs with the current contract.

## Documents

- [User Personal Access Tokens Overview](user-tokens-overview.md) — problem
  statement, user stories, non-goals, and high-level flows.
- [User Personal Access Tokens API and Schema](user-tokens-api.md) — personal
  token HTTP API, database schema, TypeScript exports, configuration, and
  verification expectations.
- [User Personal Access Tokens Architecture](user-tokens-architecture.md) —
  mint orchestration, revocation design, threat model, permissions, and
  operational concerns.
- [User Personal Access Tokens Verification](user-tokens-verification.md) —
  end-to-end verification procedure for the personal-token capability.
- [Research Notes](research-notes.md) — implementation research, findings,
  open questions, and verification notes that informed the specs.

For public user-facing contracts, prefer the main docs:

- [REST API Reference](../reference/rest-api.md)
- [Configuration Reference](../reference/configuration.md)
- [Contract Decisions](../reference/contract-decisions.md)
- [Architecture](../explanation/architecture.md)
