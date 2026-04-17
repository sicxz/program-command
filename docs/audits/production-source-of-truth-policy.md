# Production Source-of-Truth Policy

This policy defines what production-facing surfaces are allowed to depend on during the production-readiness program.

## Core Rule

If a user can reasonably interpret a value, schedule, recommendation, constraint, or department configuration as production truth, that value must come from a canonical persisted source or be clearly labeled as draft-only local state.

## Allowed Runtime Patterns

| Pattern | Allowed? | Notes |
| --- | --- | --- |
| Supabase-backed canonical reads for persisted scheduling, faculty, room, constraint, and program state | Yes | Preferred production source |
| Local draft state for unsaved edits, recovery drafts, or per-user UI preferences | Yes | Must be scoped, recoverable, and clearly non-canonical |
| Verification snapshots used only for comparison workflows | Yes | Allowed when not treated as live production truth |

## Disallowed Runtime Patterns On Release-Gated Surfaces

| Pattern | Allowed? | Why |
| --- | --- | --- |
| Embedded fallback production data in runtime code | No | Creates hidden truth sources that drift silently |
| Local JSON or static-file datasets driving production-visible scheduling or recommendation behavior | No | Breaks canonical data expectations and environment parity |
| Hardcoded department defaults that determine live department identity or platform behavior | No | Prevents safe reuse across departments |
| Mixed canonical and fallback production behavior with no explicit user-facing distinction | No | Users cannot tell what is authoritative |

## Local Draft State Rule

Local state is acceptable only when all of the following are true:

1. It represents unsaved or user-specific draft behavior.
2. It does not overwrite or masquerade as canonical persisted truth.
3. Reloading a saved production view still resolves from the canonical persisted source.
4. The draft behavior is documented as draft behavior.

## Gate Evidence Model

To pass the data-truth pillar, the release gate should be able to point to:

- `docs/audits/data-truth-audit.md` for the surface-by-surface classifications
- `docs/dev-data-freshness.md` for environment-drift verification
- `docs/scheduler-save-contract.md` for canonical saved-schedule persistence expectations
- audit evidence from `scripts/audit-runtime-dependencies.js` and its test coverage for recurring fallback patterns

## Failure Conditions

The data-truth pillar fails if any of the following remain true:

- a release-gated production surface is still classified as `legacy-fallback`
- a release-gated production surface is still `unknown-or-mixed` without a named remediation path
- local draft state is doing the job of canonical production state
- the product cannot explain which persisted source is authoritative for saved schedule data

## Decision Rule

When a runtime behavior is ambiguous, do not assume it is acceptable because it currently works. Classify it explicitly, attach evidence, and fail the pillar until the ambiguity is resolved.
