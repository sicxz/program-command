# Production Readiness Audits

This directory is the working home for the production-readiness program described in:

- `docs/brainstorms/2026-04-16-production-readiness-multi-department-program-requirements.md`
- `docs/plans/2026-04-16-001-refactor-production-readiness-gate-plan.md`

## Purpose

The audit set exists to answer one question with evidence: what has to be true before another department can safely onboard onto this product?

The audit is organized around four readiness pillars:

1. Data truth
2. Product consistency
3. Platformization
4. Operational confidence

## Artifact Map

- `production-surface-inventory.md`
  - Inventory of production-facing surfaces under review.
  - Defines which surfaces are covered by automated scanning and which remain manual review.
- `audit-evidence-model.md`
  - Common evidence and finding schema used across all audit docs.
- `data-truth-audit.md`
  - Canonical map of production data sources, draft-state allowances, and blocking fallback behavior.
- `production-source-of-truth-policy.md`
  - Policy for acceptable and unacceptable runtime data patterns.
- `product-consistency-audit.md`
  - Product-shell and dashboard consistency findings.
- `dashboard-shell-baseline.md`
  - Baseline shell and styling target for later remediation work.
- `platformization-audit.md`
  - Design-first and single-department blockers to safe reuse.
- `multi-department-blockers.md`
  - Clean blocker list for phase-2 readiness.
- `operational-confidence-audit.md`
  - QA, documentation, release, and verification readiness findings.
- `multi-department-release-gate.md`
  - Hard pass/fail gate for phase-2 entry.
- `production-readiness-program.md`
  - Synthesized remediation workstreams and sequence.

## Evidence Sources

Audit artifacts may use one or more of these evidence classes:

- Automated scan output from `scripts/audit-runtime-dependencies.js`
- Manual code review of production-facing pages, scripts, and runtime services
- Existing contract docs such as `docs/scheduler-save-contract.md`
- Existing verification docs such as `docs/dev-data-freshness.md`
- Existing regression or contract tests in `tests/`

The docs in this directory are authoritative. Automated scans support the docs; they do not replace judgment.

## Working Rules

- Keep findings anchored to repo evidence, not memory.
- Distinguish acceptable local draft state from unacceptable production fallback behavior.
- Mark unknowns explicitly rather than forcing a clean answer.
- Treat the release gate as a hard stop for phase 2, not a motivational checklist.
- Record the user as the final sign-off owner for readiness decisions.
