# Audit Evidence Model

This document defines the common evidence and finding model for the production-readiness audit set.

## Evidence Classes

| Evidence class | Meaning | Typical source |
| --- | --- | --- |
| `automated-scan` | Repeatable static scan evidence about runtime dependencies or defaults | `scripts/audit-runtime-dependencies.js` |
| `manual-code-review` | Human review of runtime behavior, page structure, or architecture | production pages, `js/`, `pages/`, `index.html` |
| `contract-doc` | Existing doc that defines canonical behavior or security expectations | `docs/scheduler-save-contract.md`, `docs/supabase-rls-write-policy-matrix.md` |
| `verification-doc` | Existing doc that defines how to verify environment or release state | `docs/dev-data-freshness.md`, `docs/department-onboarding-qa-pack.md` |
| `test-contract` | Existing or new automated test that protects a contract or audit artifact | `tests/*.test.js` |
| `unknown` | Evidence was not strong enough to classify confidently | used only when uncertainty is explicit |

## Finding Types

Each finding should be assigned one primary type:

- `foundational-gap`
  - Missing platform capability or contract needed before multi-department rollout.
- `correctness-risk`
  - Behavior that can produce inaccurate, unsafe, or misleading production results.
- `consistency-issue`
  - Product-shell, navigation, state, or visual inconsistency that harms coherence.
- `docs-process-gap`
  - Missing or drifting operational guidance, QA path, or release evidence.

## Finding Record

Every audit finding should capture:

| Field | Requirement |
| --- | --- |
| `finding_id` | Stable short id unique within the audit doc |
| `pillar` | One of `data-truth`, `product-consistency`, `platformization`, `operational-confidence` |
| `type` | One of the four finding types above |
| `surface` | Production surface or runtime area affected |
| `impact` | What risk or product cost this creates |
| `evidence` | One or more evidence references with enough detail to revisit the claim |
| `recommended_outcome` | What should be true after remediation |
| `blocks_multi_department` | `yes`, `no`, or `unknown` |
| `status` | `open`, `in-progress`, `accepted-risk`, or `closed` |

## Release-Gate Evidence

When a finding contributes to the hard release gate, the audit should also capture:

- the gate criterion it affects
- the proof required to pass that criterion
- the artifact or verification step that will provide the proof

## Unknowns Rule

If the audit cannot responsibly classify something yet:

- mark it as `unknown`
- state what is unknown
- state what evidence is missing
- avoid converting uncertainty into a clean pass

Unknowns are allowed in pillar audits. They are not allowed in a passed release gate.
