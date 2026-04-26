# Smoke E2E Flake Investigation Log (Service Tokens Harness)

Last updated: 2026-04-25

## Problem Statement
The Playwright smoke test for `Create token` is flaky. The failing symptom is:

- `waiting for "platform" option to become available`
- visible dropdown options sometimes contain only `Select a group…`

This means the create dialog opens but no real catalog groups are loaded in time.

## What We Know (Observed Facts)

1. Harness catalog seed contains:
   - `user:development/guest`
   - `group:development/platform`
2. `serviceTokens.admin.userEntityRefs` is set to `user:development/guest`.
3. During failing runs, backend logs and Playwright traces show startup race behavior:
   - early guest tokens include only `user:development/guest`
   - later guest tokens include `group:development/platform`
4. In failing traces, calls to `GET /api/catalog/entities?filter=kind=group|Group&limit=200` can return empty JSON (`[]`) early, then later return populated payloads.
5. Even when readiness sees `group:development/platform`, UI dropdown can still be empty in some runs.

## Assumptions We Made

1. Catalog and auth identity become eventually consistent after cold startup.
2. Group-loading should be resilient to:
   - endpoint shape differences (`[]` vs `{ items: [] }`)
   - endpoint behavior differences (`/entities` vs `/entities/by-query`)
   - temporary auth identity missing ownership groups
3. Smoke should fail early with diagnostics if the required harness group is not truly available.

## Attempt History (Chronological)

### A. Namespace / Harness Contract Alignment
- Set harness org group namespace to `development`.
- Kept admin user ref contract at `user:development/guest`.
- Confirmed `service-tokens-org.yaml` remains registered in harness app config.
- Outcome: necessary baseline; did not alone remove flake.

### B. Frontend Group Fetch Hardening (first pass)
Changes in `ServiceTokensPage`:
- retry loop (30 attempts x 2s)
- canonical kind filter attempts (`group`, `Group`)
- response shape handling for array and object-with-items
- one-shot refetch when opening create dialog

Outcome:
- improved behavior, but still intermittent empty dropdown.

### C. Smoke Readiness Hardening
Changes in smoke spec:
- `waitForServiceTokensPage` with guest-entry tolerance
- catalog polling with explicit diagnostics
- added status/payload snippets on timeout

Outcome:
- surfaced root failures clearly (fetch failures, 401 missing credentials, empty group list).

### D. Authenticated Readiness Polling
- Readiness switched to explicit guest token retrieval (`/api/auth/guest/refresh`) and authorized catalog reads.
- Added by-name readiness check for required group:
  - `/api/catalog/entities/by-name/group/development/platform`

Outcome:
- readiness became more deterministic; no longer blocked by unauthenticated polling.

### E. Selection Robustness / Diagnostics
- selector updated to handle option text containing extra description.
- added option-list diagnostics at timeout.

Outcome:
- confirmed true failing condition: dropdown sometimes has only `Select a group…`.

### F. Frontend Group Fetch Hardening (second pass)
Further changes in `ServiceTokensPage`:
- try both endpoints:
  - `/entities/by-query?filter=kind=...`
  - `/entities?filter=kind=...`
- normalize multiple payload shapes (`items`, `results`, arrays)
- always refresh groups before opening create dialog
- fallback to ownership refs from `/api/auth/v1/userinfo`

Outcome:
- improved success rate, but flake still reproduces in some runs.

### G. State-Based UI Gate for Create Dialog (third pass)
Further changes in `ServiceTokensPage`:
- track group readiness states (`groupsLoading`, `groupsError`)
- require a successful group load before opening the create dialog
- disable `Create token` while group loading is in progress
- show explicit on-page error when groups are not available after bounded retries

Further changes in smoke spec:
- wait for `Create token` actionability (enabled state), not only visibility
- keep catalog by-name readiness check as a prerequisite

Expected outcome:
- no create-dialog open with empty-only group select
- smoke waits on the same UI readiness condition the user depends on
- failures should now report readiness/actionability instead of option-selection ambiguity

Observed validation:
- run 1 passed
- run 2 failed with the same symptom (`visibleOptions=["Select a group…"]`)
- conclusion: G reduced some timing issues but did not fully remove the race

### H. Concrete Options Gate + Empty-State Dialog Guard (fourth pass)
Further changes in `ServiceTokensPage`:
- `loadGroupOptions` now returns the concrete resolved options array (not boolean)
- `handleOpenCreate` opens only when `nextOptions.length > 0`

Further changes in `CreateTokenDialog`:
- disable owning-group select while options are empty
- show explicit helper text when groups are still loading

Expected outcome:
- avoid opening with stale/ambiguous readiness signals
- no interactive empty group picker state

Observed validation:
- mixed; reproducible failure still occurred in consecutive cold runs with unchanged symptom
- conclusion: cached-state short circuit in open flow can still allow a false-ready path

### I. Fresh Blocking Group Load on Dialog Open (fifth pass)
Further changes in `ServiceTokensPage`:
- remove cached-options shortcut in `handleOpenCreate`
- always perform a fresh `await loadGroupOptions()` before opening dialog
- keep open blocked when the fresh result is empty

Expected outcome:
- remove stale readiness path entirely at dialog-open boundary

Observed validation:
- a subsequent run failed on a different path before reaching group selection:
  - guest sign-in page stayed active with runtime message:
    - "You cannot sign in as a guest, you must either enable the legacy guest token or configure the auth backend to support guest sign in."
- conclusion: there are at least two independent cold-start flake classes:
  1) group-options convergence
  2) guest-auth readiness race during early page load

### J. Guest Auth Readiness Gate in Smoke (sixth pass)
Further changes in smoke spec:
- added `waitForGuestAuthReady` polling `/api/auth/guest/refresh` before visiting `/admin/service-tokens`
- in `waitForServiceTokensPage`, detect guest-signin runtime error and recover by reloading

Expected outcome:
- reduce early-page auth startup failures that prevent reaching Service Tokens route
- isolate remaining flakes to catalog/group readiness only

Observed validation:
- after J, a cold run passed end-to-end
- auth-entry flake class appears mitigated in current sample
- group-selection flake remains historically reproducible and still needs multi-run burn-in confirmation after I/J together

### K. By-Name Verified Ownership Fallback in UI (seventh pass)
Further changes in `ServiceTokensPage`:
- trigger `GET /api/auth/guest/refresh` before group loading attempts
- when using ownership refs fallback, verify each group via:
  - `/api/catalog/entities/by-name/group/<namespace>/<name>`
- only treat fallback groups as ready if by-name lookup returns an actual `Group` entity

Expected outcome:
- remove false-positive readiness from ownership refs that are not yet catalog-resolvable
- align UI open gating with concrete catalog availability

Observed validation:
- two consecutive cold runs passed after K
- no reproduction of prior group-selection error in this short burn-in window
- auth-entry readiness remained stable with J in place

Current assessment:
- confidence improved materially, but full confidence still requires longer burn-in
  (for example 5+ consecutive cold runs)

### L. Burn-In Attempt (5 consecutive runs) hit harness startup anomaly
Validation attempt:
- executed 5 sequential `npm run test:ui-smoke` runs in a loop
- all 5 failed before test execution with webserver startup error:
  - `Error: listen EPERM: operation not permitted ::1:3000`
  - followed by child-process `EPIPE`

Interpretation:
- this does not reflect a service-token flow assertion failure
- failure occurred in harness webserver boot path (`config.webServer`), so burn-in signal is inconclusive

Control check after L:
- ran a standalone smoke run immediately after loop
- standalone run passed end-to-end

Conclusion from L:
- current evidence suggests an environment/startup instability under rapid repeated harness boot, not a confirmed regression in the service-token create/audit/revoke path

### M. Paced Burn-In Attempt (5 runs, cooldown between runs)
Validation attempt:
- executed 5 sequential runs with 6-second cooldown between runs

Result matrix:
- run_1: FAIL
- run_2: FAIL
- run_3: FAIL
- run_4: FAIL
- run_5: FAIL

Failure signature across all five:
- `Error: listen EPERM: operation not permitted ::1:3000`
- followed by `Process from config.webServer was not able to start. Exit code: 1`

Additional control probe:
- attempted forcing IPv4 (`HOST=127.0.0.1`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`)
- failure still attempted bind on `::1:3000`, indicating harness/dev-server bind behavior is not controlled by this env in current setup

Conclusion from M:
- burn-in remains blocked by harness webserver startup instability
- no new signal was obtained on service-token functional flakiness from this run set

### N. Escalated Burn-In (outside sandbox port restrictions)
Validation attempt:
- ran smoke once with escalated permissions to confirm harness startup path
- then ran a 5-run burn-in loop (2-second cooldown) with the same command

Result matrix:
- run_1: PASS
- run_2: PASS
- run_3: PASS
- run_4: PASS
- run_5: PASS

Conclusion from N:
- service-token smoke path is stable in this run set
- prior burn-in failures were attributable to sandbox/host environment bind restrictions (`::1:3000`), not reproduced as product-flow failures under unrestricted local execution

## Online Research Summary

No exact public issue matched this exact harness+smoke race, but relevant guidance supports current diagnosis and direction:

1. Backstage Catalog API docs: `GET /entities` is deprecated in favor of `GET /entities/by-query`.
   - https://backstage.io/docs/features/software-catalog/software-catalog-api
2. Catalog API (`/`) docs show `/entities/by-query` canonical response shape and auth expectations.
   - https://backstage.io/docs/features/software-catalog/software-catalog-api/
3. Identity resolver docs clarify ownership claims (`ent`) and note ownership resolution behavior; this aligns with observed token evolution from user-only to user+group.
   - https://backstage.io/docs/auth/identity-resolver
4. Auth API type docs confirm `ownershipEntityRefs` is the stable backend user-info shape.
   - https://backstage.io/api/stable/interfaces/_backstage_backend-plugin-api.index.BackstageUserInfo.html

## Key Insight from Trace Artifacts

In failing traces:
- early authorized catalog group-list requests return empty payloads
- later authorized requests can return populated group payload
- dropdown still may remain empty if UI state was derived before identity/catalog convergence window

This indicates a real cold-start convergence race, not just a selector issue.

## Ideas Already Tried (Do Not Repeat as-is)

1. Unauthenticated backend polling from browser context
2. Exact-label-only option match (`^platform$`)
3. Empty-only create-dialog refetch trigger
4. `/entities`-only group query strategy

## Next Candidate Fixes (If flake persists after G)

1. **Require by-name group readiness in UI path**
   - for harness/dev mode, optionally check `group:development/platform` by-name readiness before showing select.
2. **Trigger auth refresh before group load**
   - call `/api/auth/guest/refresh` immediately before group fetch loop to reduce stale user-only token windows.
3. **Use catalog client `queryEntities` semantics consistently**
   - avoid mixed endpoint behavior by standardizing to by-query + normalized parsing.

## Why This File Exists
To prevent repeated investigation loops by preserving:
- assumptions
- attempts and outcomes
- concrete artifacts and findings
- prioritized next hypotheses
