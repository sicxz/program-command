# Data Truth Audit

This audit answers a narrow but critical readiness question: where does user-visible production data come from today, and which of those sources are acceptable for a multi-department platform?

## Source Classes

| Source class | Meaning | Release-gate posture |
| --- | --- | --- |
| `canonical-db-backed` | User-visible production state comes from Supabase or another explicit persisted canonical store | Passable if scoping, accuracy, and verification are also satisfied |
| `acceptable-local-draft-state` | Unsaved user work or temporary UI state stored locally for recovery or in-progress editing only | Allowed, but must not masquerade as canonical production truth |
| `legacy-fallback` | Local JSON, embedded fallback data, or hardcoded defaults used to keep production-visible surfaces working | Blocking until retired or explicitly re-scoped away from production behavior |
| `unknown-or-mixed` | The surface mixes canonical and fallback behavior, or current evidence is not strong enough to classify it cleanly | Blocking until clarified |

## Surface Decisions

| Surface | Current classification | Why | Evidence |
| --- | --- | --- | --- |
| Main scheduler (`index.html`) | `unknown-or-mixed` | Uses Supabase-aware runtime paths but still fetches local datasets, persists user-visible state to localStorage, and includes embedded fallback enrollment data | `index.html`, `scripts/audit-runtime-dependencies.js`, `docs/AUDIT-ISSUES-2026-02-21.md` |
| Schedule builder (`pages/schedule-builder.js`) | `unknown-or-mixed` | Save flow is database-aware, but placement, catalog, workload, room, and constraint inputs still come from local files and local draft state | `pages/schedule-builder.js`, `docs/scheduler-save-contract.md` |
| Workload dashboard (`pages/workload-dashboard.js`) | `acceptable-local-draft-state` plus `unknown-or-mixed` | UI state stored locally is acceptable as draft behavior, but the surrounding dashboard still depends on legacy local schedule and workload assumptions that need explicit classification | `pages/workload-dashboard.js`, `js/workload-integration.js` |
| Constraints dashboard (`pages/constraints-dashboard.js`) | `unknown-or-mixed` | The dashboard now prefers canonical Supabase-backed constraints, rooms, faculty, and faculty-preference data, but still falls back to local JSON when the database is unavailable and routes course-level edits into the course catalog instead of fully owning that surface | `pages/constraints-dashboard.js`, `pages/course-management.js`, `js/db-service.js` |
| Release-time dashboard (`pages/release-time-dashboard.js`) | `unknown-or-mixed` | Department-aware behavior exists, but release-time evidence still depends on local workload-derived inputs outside the canonical persistence story | `pages/release-time-dashboard.js`, `js/release-time-manager.js` |
| Recommendations and optimizer dashboards (`pages/recommendations-dashboard.html`, `pages/course-optimizer-dashboard.html`) | `unknown-or-mixed` | These pages now prefer canonical saved schedule, course, faculty, and projected-enrollment reads from Supabase, but they still fall back to local JSON when canonical schedule data is missing or incomplete | `pages/recommendations-dashboard.html`, `pages/recommendations-dashboard.js`, `pages/course-optimizer-dashboard.html`, `pages/course-optimizer-dashboard.js`, `js/canonical-dashboard-data.js` |
| Department onboarding and profile runtime (`pages/department-onboarding.js`, `js/department-profile.js`, `js/profile-loader.js`) | `unknown-or-mixed` | Supabase-backed program config exists, but activation, manifest loading, embedded fallback profile, and local custom profile storage still shape runtime behavior | `docs/department-profile-schema-v1.md`, `pages/department-onboarding.js`, `js/department-profile.js`, `js/profile-loader.js` |
| Core DB-backed save path (`js/db-service.js`, `docs/scheduler-save-contract.md`) | `canonical-db-backed` | The intended canonical saved-schedule story is year-scoped database persistence through the RPC contract | `js/db-service.js`, `docs/scheduler-save-contract.md` |

## Blocking Findings

| ID | Type | Surface | Impact | Recommended outcome | Blocks multi-department |
| --- | --- | --- | --- | --- | --- |
| DTR-001 | `foundational-gap` | Main scheduler and schedule builder | Production-facing scheduling behavior still depends on local datasets and embedded fallback data, which prevents a stable truth model | Retire or isolate local datasets from production-visible scheduling behavior and document any remaining draft-only local state | yes |
| DTR-002 | `correctness-risk` | Constraints and recommendation surfaces | Local file inputs can drift from database-backed scheduling reality, leading to inconsistent user-visible advice | Move user-visible rule and recommendation inputs onto canonical persisted data or formally remove them from the release gate | yes |
| DTR-003 | `foundational-gap` | Department onboarding and profile runtime | Mixed local manifest/profile activation and Supabase program config create ambiguity about which department configuration is authoritative | Define one canonical runtime identity and profile source model before onboarding another department | yes |
| DTR-004 | `docs-process-gap` | Whole product | Existing verification docs prove freshness and save integrity in slices, but they do not yet define a full source-of-truth pass condition | Tie drift checks, save contracts, and future release-gate evidence into one data-truth policy | yes |

## Gate Implications

The data-truth pillar cannot pass until all of the following are true:

1. Every production-facing surface in the release gate has a declared source class.
2. No release-gated production surface remains in `legacy-fallback`.
3. No release-gated production surface remains in `unknown-or-mixed` without a bounded remediation decision.
4. Acceptable local draft state is explicitly documented and separated from canonical persisted truth.
5. Existing verification artifacts such as drift checks and save contracts are linked to the same policy vocabulary.

Constraints dashboard note:

- The constraints dashboard has moved out of pure `legacy-fallback` mode by preferring canonical database reads and handing course-level rule editing off to the course catalog.
- It still does not pass the pillar because any DB outage or misconfigured host drops the page back to local fallback data, which keeps the surface in `unknown-or-mixed`.

## Proof Required To Pass

- A complete source-class decision for each release-gated production surface
- A written policy describing allowed and disallowed runtime source patterns
- Evidence that saved schedule state is canonical when a user reloads production data
- Evidence that remaining local state is draft-only and not masquerading as canonical truth

## References

- `docs/audits/production-surface-inventory.md`
- `docs/audits/production-source-of-truth-policy.md`
- `docs/dev-data-freshness.md`
- `docs/scheduler-save-contract.md`
