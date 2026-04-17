# Production Surface Inventory

This inventory defines the production-facing surfaces included in the readiness audit. It is intentionally broader than the scheduler grid alone because phase 1 needs a product-wide readiness picture.

## Surface Inventory

| Surface | Entry files | Release gate | Coverage mode | Current signal |
| --- | --- | --- | --- | --- |
| Main scheduler | `index.html` | Yes | Automated + manual | Mixed runtime: Supabase, local JSON, localStorage, embedded fallback data |
| Schedule builder | `pages/schedule-builder.html`, `pages/schedule-builder.js` | Yes | Automated + manual | Drafting and save flow still mix local data and database behavior |
| Workload dashboard | `pages/workload-dashboard.html`, `pages/workload-dashboard.js` | Yes | Automated + manual | Dashboard shell and state handling must align with the platform baseline |
| Constraints dashboard | `pages/constraints-dashboard.html`, `pages/constraints-dashboard.js` | Yes | Automated + manual | Rules editing still depends on local rule exports and local data inputs |
| Release-time dashboard | `pages/release-time-dashboard.html`, `pages/release-time-dashboard.js` | Yes | Automated + manual | Department-aware release-time behavior exists, but storage and data paths need audit |
| Recommendations dashboard | `pages/recommendations-dashboard.html` | Yes | Automated + manual | User-visible planning surface with local dataset dependencies |
| Course optimizer dashboard | `pages/course-optimizer-dashboard.html` | Yes | Automated + manual | User-visible planning surface with local dataset dependencies |
| Department onboarding | `pages/department-onboarding.html`, `pages/department-onboarding.js` | Yes | Automated + manual | Current onboarding flow still reflects local profile activation assumptions |
| Login and recovery handoff | `pages/login.js` | Yes | Automated + manual | Authentication and recovery flow uses local recovery state and schedule import handoff |
| Core runtime services | `js/supabase-config.js`, `js/db-service.js`, `js/department-profile.js`, `js/profile-loader.js`, `js/schedule-manager.js` | Yes | Automated + manual | Core hybrid runtime where source-of-truth, platformization, and fallback behavior intersect |

## Automated Scan Targets (Unit 1)

The default scan set for `scripts/audit-runtime-dependencies.js` covers these files:

- `index.html`
- `js/supabase-config.js`
- `js/db-service.js`
- `js/department-profile.js`
- `js/profile-loader.js`
- `js/schedule-manager.js`
- `pages/schedule-builder.js`
- `pages/workload-dashboard.js`
- `pages/department-onboarding.js`
- `pages/constraints-dashboard.js`
- `pages/release-time-dashboard.js`
- `pages/login.js`
- `pages/recommendations-dashboard.html`
- `pages/course-optimizer-dashboard.html`

These targets are meant to catch recurring classes of evidence quickly:

- local JSON or static-file fetches
- `localStorage` usage
- fallback or hardcoded markers
- Design-first defaults such as `DESN`, `Design`, or `design-v1`

## Manual-Review Expectations

Automated scan coverage is helpful but incomplete. Manual review is still required for:

- user-flow quality and product coherence
- whether a fallback is acceptable draft state or unacceptable production behavior
- whether a page belongs in the final hard gate
- whether a surfaced pattern is cosmetic drift, workflow friction, or a true blocker
