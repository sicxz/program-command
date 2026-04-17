# Production Readiness Program

This document synthesizes the readiness audits into the smallest practical set of workstreams needed to clear the hard gate for multi-department rollout.

## Program Goal

Move from today's hybrid, Design-first, partially converged product into a platform that is trustworthy enough to onboard another department without multiplying current inconsistency.

## Workstreams

| Workstream | Goal | Depends on | Clears gate pressure on |
| --- | --- | --- | --- |
| W1. Canonical data/runtime convergence | Remove or explicitly bound production fallback data, clarify draft-vs-canonical behavior, and make saved production views clearly DB-backed | Audit foundation complete | Data truth |
| W2. Shared dashboard shell convergence | Normalize release-gated surfaces to one coherent shell, theme, status model, and navigation pattern | Audit foundation complete | Product consistency |
| W3. Canonical multi-department runtime contract | Replace overlapping Design-default, local-profile, and program-aware models with one explicit release-gated platform contract | Audit foundation complete; benefits from W1 | Platformization |
| W4. Release evidence and operational discipline | Turn the audits and checks into an ongoing release decision system with explicit proof and solo-builder sign-off | W1-W3 evidence available | Operational confidence |

## Recommended Sequence

### Phase 1: Evidence and audit foundation

- Completed through the current readiness audit set and lightweight scanner/tests

### Phase 2: Foundational remediation

1. W1. Canonical data/runtime convergence
2. W3. Canonical multi-department runtime contract

Reason:

- These two streams remove the deepest ambiguity about what the product is actually doing.
- Product consistency work is higher leverage after the runtime and data contract are less mixed.

### Phase 3: Product convergence

3. W2. Shared dashboard shell convergence

Reason:

- Once data truth and platform identity are clearer, dashboard convergence can target the right product shell instead of polishing legacy ambiguity.

### Phase 4: Release discipline and gate closure

4. W4. Release evidence and operational discipline

Reason:

- The gate becomes meaningful only when the remediation workstreams have actual evidence to attach to it.

## Workstream Detail

### W1. Canonical data/runtime convergence

Targets:

- retire or bound local JSON dependencies on release-gated surfaces
- make acceptable draft-only local state explicit
- verify that reloadable saved production views resolve from canonical persisted sources

Primary sources:

- `docs/audits/data-truth-audit.md`
- `docs/audits/production-source-of-truth-policy.md`

### W2. Shared dashboard shell convergence

Targets:

- adopt one shared shell direction for release-gated surfaces
- align navigation, status language, summary cards, and empty states
- either normalize legacy bespoke pages or exclude them from the gate until remediated

Primary sources:

- `docs/audits/product-consistency-audit.md`
- `docs/audits/dashboard-shell-baseline.md`

### W3. Canonical multi-department runtime contract

Targets:

- define one canonical runtime identity story
- define one canonical profile/runtime source model
- separate temporary bootstrap behavior from the final multi-department platform contract

Primary sources:

- `docs/audits/platformization-audit.md`
- `docs/audits/multi-department-blockers.md`

### W4. Release evidence and operational discipline

Targets:

- maintain one gate board and evidence record
- require explicit sign-off and explicit accepted-risk documentation if a gate override is chosen
- keep transitional rollout docs bounded by the gate

Primary sources:

- `docs/audits/operational-confidence-audit.md`
- `docs/audits/multi-department-release-gate.md`

## Relationship To The Older Audit Backlog

`docs/AUDIT-ISSUES-2026-02-21.md` remains useful as a raw issue inventory, but it is no longer the primary readiness narrative by itself.

Use it like this:

- bug-level and contract-level findings feed into W1
- shell and dashboard issues feed into W2
- multi-tenant and department-scoping issues feed into W3
- release-process and verification gaps feed into W4

If an old finding does not map to one of these workstreams, either:

- mark it obsolete, or
- treat it as non-blocking backlog work outside the readiness gate

## Phase-2 Entry Condition

Phase 2 begins only when:

1. `docs/audits/multi-department-release-gate.md` shows all four pillars as `pass`
2. blocker lists in the audit set no longer contain unresolved phase-2 blockers for release-gated behavior
3. the user explicitly signs off that the gate has passed

If those conditions are not met, phase 2 is still blocked no matter how tempting department onboarding feels.
