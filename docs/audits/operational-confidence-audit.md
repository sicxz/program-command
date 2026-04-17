# Operational Confidence Audit

This audit evaluates whether the current repo, docs, and verification habits are strong enough to support safe production changes and an eventual multi-department rollout for a solo builder.

## Current Strengths

- The repo already contains contract-style docs for important slices such as save behavior and RLS policy expectations.
- There is an environment drift check in `docs/dev-data-freshness.md` and `scripts/check-data-freshness.js`.
- There is a department onboarding QA pack that captures a meaningful regression path for onboarding-related flows.
- The readiness program now has doc-backed tests that reduce silent drift in the audit itself.

## Current Gaps

| Area | Current state | Impact |
| --- | --- | --- |
| Single release gate | No one document yet combines all four pillars into a single pass/fail decision | Makes it hard to say "not ready" with confidence |
| Evidence collection | Verification evidence is spread across multiple docs and scripts without one shared gate vocabulary | Easy to miss proof requirements or overestimate readiness |
| Transitional docs | Some rollout docs still assume local-profile onboarding is enough on its own | Can encourage phase-2 behavior before platform readiness is real |
| Solo-builder operations | Current docs imply process, but do not yet clearly state how a single builder records sign-off and overrides | Creates ambiguity at the moment of release decision |

## Findings

| ID | Type | Surface | Impact | Recommended outcome | Blocks multi-department |
| --- | --- | --- | --- | --- | --- |
| OCA-001 | `docs-process-gap` | Release decision model | Without one hard gate, readiness remains interpretive and easier to wave through | Define one multi-department release gate with four pillars and explicit proof requirements | yes |
| OCA-002 | `docs-process-gap` | Evidence management | Existing verification docs are useful but not yet organized as one decision system | Cross-reference existing checks into the gate and require evidence per pillar | yes |
| OCA-003 | `docs-process-gap` | Solo-builder sign-off | The repo does not yet say how final readiness approval is recorded when there is only one builder | Make the user the explicit sign-off owner and require an evidence-backed gate decision | yes |
| OCA-004 | `foundational-gap` | Transitional rollout guidance | QA artifacts can be mistaken for readiness proof before the underlying platform is actually ready | Bound legacy rollout docs behind the multi-department release gate | yes |

## Operational Confidence Pass Conditions

The operational-confidence pillar cannot pass until:

1. One release-gate document exists for the whole readiness program.
2. Each pillar has required evidence, not just narrative conclusions.
3. Transitional rollout docs are clearly bounded by the gate.
4. The sign-off owner and decision rule are explicit.

## References

- `docs/dev-data-freshness.md`
- `docs/department-onboarding-qa-pack.md`
- `docs/audits/multi-department-release-gate.md`
- `scripts/check-data-freshness.js`
