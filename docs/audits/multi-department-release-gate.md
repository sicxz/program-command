# Multi-Department Release Gate

This document is the hard gate for starting phase-2 multi-department implementation work.

## Decision Rule

Phase 2 does not begin until all four pillars pass with evidence.

The decision owner is the user as the sole builder and final release decision-maker. AI tools can help gather evidence, draft docs, and verify artifacts, but they do not replace sign-off.

## Gate Status Model

Each pillar must be in exactly one state:

- `pass`
- `fail`
- `in-progress`

`in-progress` is not a pass.

## Pillar Gate Criteria

| Pillar | Required pass condition | Required proof |
| --- | --- | --- |
| Data truth | Every release-gated surface has a declared source class, and no release-gated surface remains in `legacy-fallback` or unresolved `unknown-or-mixed` state | `docs/audits/data-truth-audit.md`, `docs/audits/production-source-of-truth-policy.md`, relevant verification docs |
| Product consistency | Every release-gated surface has been assessed against the consistency rubric and either aligns to the baseline, is blocked as remediation work, or is intentionally excluded from the gate | `docs/audits/product-consistency-audit.md`, `docs/audits/dashboard-shell-baseline.md`, updated UI guidance |
| Platformization | Runtime identity, profile source, bootstrap-vs-platform contract, onboarding contract, and scoping expectations are explicitly documented and no blocker remains unresolved for release-gated behavior | `docs/audits/platformization-audit.md`, `docs/audits/multi-department-blockers.md`, updated profile/onboarding docs |
| Operational confidence | One decision system exists for evidence collection, transitional rollout docs are bounded, and the sign-off owner plus proof rules are explicit | `docs/audits/operational-confidence-audit.md`, this document, supporting verification docs |

## Gate Board

| Pillar | Status | Evidence summary | Blocking items |
| --- | --- | --- | --- |
| Data truth | fail | Audit complete, remediation not complete | DTR-001, DTR-002, DTR-003, DTR-004 |
| Product consistency | fail | Audit complete, baseline defined, convergence work not complete | PCI-001, PCI-002, PCI-003, PCI-004 |
| Platformization | fail | Audit complete, blocker categories defined, canonical runtime model unresolved | PTA-001, PTA-002, PTA-003, PTA-004, PTA-005 |
| Operational confidence | fail | Gate now defined, but the full evidence set and final sign-off flow are not yet complete | OCA-001, OCA-002, OCA-003, OCA-004 |

## Failure Rules

The gate fails if any of the following are true:

- any pillar is `fail`
- any pillar is `in-progress`
- required proof for a pillar is missing or ambiguous
- a blocker is accepted informally without being documented as an explicit accepted risk decision

## Override Rule

The default rule is no override.

If the user intentionally chooses to start phase 2 early anyway, that decision must be recorded as an explicit accepted-risk decision with:

- the pillar being overridden
- the unresolved blockers
- why the override is being taken
- what evidence is still missing

An override does not count as a passed gate.
