# Contract Decisions

This note records the canonical public behavior for the plugin where earlier LLM-assisted sessions left code, tests, and docs out of sync.

These decisions are the source of truth for future edits unless the public contract is intentionally changed.

---

## Audit Log API

- `GET /api/service-tokens/:id/audit` returns an object with an `events` array.
- Each audit event uses the current backend/storage field names:
  - `id`
  - `tokenId`
  - `event`
  - `actor`
  - `metadata`
  - `occurredAt`
- Revocation reasons are stored inside `metadata.reason`.

Why:

- This matches the implemented database model and backend tests.
- It preserves a stable, extensible event envelope for future audit metadata without introducing event-specific top-level fields.

---

## Audit Event Ordering

- Audit events are returned newest-first.

Why:

- This is the most useful operator default in admin UIs and API inspection flows.
- It matches the existing backend implementation and frontend expectation for recent activity first.

---

## Revocation and Cache TTL

- Revocation takes effect after cache invalidation, which is bounded by `serviceTokens.cacheTtlSeconds`.
- The documented default remains `60` seconds.
- Beginner/tutorial flows should explicitly set `serviceTokens.cacheTtlSeconds: 0` when they need deterministic immediate rejection after revocation.

Why:

- Claiming immediate rejection under default settings is misleading.
- Explicit zero-TTL tutorial config gives a predictable developer experience without changing the production-oriented default.

---

## Frontend Installation Pattern

- The canonical setup example uses `createApp({ features: [...] })` with `serviceTokensPlugin` included in the `features` array.
- Documentation should show `@backstage/frontend-defaults` as the recommended import for scaffolded Backstage apps unless a document is specifically about another app bootstrap style.

Why:

- This matches the current tutorial path and common Backstage scaffold expectations.
- One primary example reduces adoption friction and avoids docs drift.
