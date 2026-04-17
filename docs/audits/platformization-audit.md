# Platformization Audit

This audit evaluates whether the current runtime is genuinely reusable across departments or still anchored to Design-first assumptions.

## Current Hybrid Platform State

The repo is not purely single-department anymore, but it is also not yet one coherent multi-department platform. It currently contains three overlapping models:

1. **Design-seeded defaults**
   - Hardcoded department identity and fallback profile assumptions such as `DESN`, `Design`, and `design-v1`
2. **Local profile activation model**
   - Manifest/profile-file loading, local custom profile storage, and local active-profile selection
3. **Program-aware runtime path**
   - Program shell selection, department-aware onboarding handoff, department-scoped DB service behavior, and Supabase-backed profile loading

The blocking problem is not lack of ambition. It is overlap without a single canonical runtime contract.

## Blocking Areas

| Area | Current state | Evidence |
| --- | --- | --- |
| Runtime identity | `js/supabase-config.js` and `js/db-service.js` now prefer active profile, shell selection, and onboarding context before Design bootstrap defaults, but the bootstrap fallback still exists and remains explicitly non-canonical | `js/supabase-config.js`, `js/db-service.js`, `tests/supabase-config.runtime-context.test.js` |
| Seeded onboarding catalog | `js/program-shell.js` seeds all future programs from `design-v1`, which is a useful bootstrap but not a final reusable platform contract | `js/program-shell.js`, `tests/program-shell.test.js` |
| Profile source of truth | `js/department-profile.js` still centers manifest/file loading and local storage, while `js/profile-loader.js` now resolves canonical program config from auth, shell selection, onboarding context, or bootstrap fallback in an explicit order. The repo now includes a canonical Design seed for `programs.config`, but that seed still has to be applied in develop/production before the platform can rely on it operationally. | `js/department-profile.js`, `js/profile-loader.js`, `tests/profile-loader.test.js`, `scripts/supabase-program-config-seed-t07.sql` |
| Onboarding handoff | `pages/department-onboarding.js` now calls out canonical-vs-bootstrap runtime state explicitly, but the workflow still saves and activates local versioned profiles as bootstrap artifacts | `pages/department-onboarding.js`, `pages/department-onboarding.html`, `docs/department-onboarding-qa-pack.md` |
| Storage isolation | Namespaced storage prefixes exist, but they are still rooted in profile-driven local storage behavior rather than a fully canonical platform state model | `js/department-profile.js`, `pages/department-onboarding.js`, `tests/release-time-manager.profile-scope.test.js` |
| Department scoping in the data layer | DB service has meaningful department scoping behavior, but its initialization still tolerates Design fallbacks and local JSON fallback mode | `js/db-service.js`, `tests/db-service.department-scoping.test.js` |

## Blocking Findings

| ID | Type | Surface | Impact | Recommended outcome | Blocks multi-department |
| --- | --- | --- | --- | --- | --- |
| PTA-001 | `foundational-gap` | Runtime identity | Runtime identity resolution is now explicit, but the final release-gated contract still needs to remove or tightly bound the remaining Design bootstrap fallback | Define one canonical runtime identity resolution path and demote Design defaults to non-production bootstrap only | yes |
| PTA-002 | `foundational-gap` | Profile source model | The codebase supports both local file-backed profiles and Supabase-backed program config without one declared canonical source, even though the repo now includes a canonical Design seed for `programs.config` | Decide and document the canonical profile/runtime source model for release-gated behavior, then apply the canonical seed in environment setup | yes |
| PTA-003 | `foundational-gap` | Program shell onboarding | Program shell seeding from `design-v1` is practical for bootstrap, but it means new departments still inherit Design assumptions by default | Reframe Design seeding as temporary bootstrap behavior and define what must replace it before phase 2 | yes |
| PTA-004 | `docs-process-gap` | Onboarding docs | Current onboarding docs still read like a local profile activation rollout, not a platformized multi-department system | Update docs so they describe the hybrid current state honestly and gate onboarding behind platform readiness | yes |
| PTA-005 | `correctness-risk` | Data/runtime interaction | Department-scoped DB behavior exists, but local fallback mode and mixed runtime assumptions can still blur canonical scoping expectations | Clarify how department scoping behaves when canonical persisted context is absent, and fail the gate until that behavior is explicit | yes |

## Phase-2 Risk Statement

If another department is onboarded before these blockers are resolved, the most likely outcome is that the new department lands on top of Design-derived defaults, local profile activation behavior, and mixed canonical/fallback runtime rules. That is not safe reuse; it is a larger blast radius.

## Proof Required To Pass

- The runtime has one documented identity-resolution story for release-gated behavior
- The canonical profile source model is documented and the competing fallback models are explicitly bounded
- Program shell bootstrap behavior is distinguished from the final platform contract
- Onboarding documentation reflects the actual platform state and phase-2 entry conditions
- Department scoping expectations are explicit for both canonical and degraded runtime states

## References

- `docs/audits/multi-department-blockers.md`
- `docs/department-profile-schema-v1.md`
- `docs/department-onboarding-qa-pack.md`
- `js/supabase-config.js`
- `js/db-service.js`
- `js/program-shell.js`
- `js/department-profile.js`
- `js/profile-loader.js`
