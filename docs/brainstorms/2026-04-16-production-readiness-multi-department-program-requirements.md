---
date: 2026-04-16
topic: production-readiness-multi-department-program
---

# Production Readiness Audit and Multi-Department Release Gate

## Problem Frame
The product goal is to support additional departments, but the current production experience is not yet a trustworthy multi-department platform. The repo still shows a hybrid operating model: some flows are Supabase-backed while others still depend on local JSON, localStorage, hardcoded defaults, and Design-first assumptions. At the same time, dashboards and pages are not yet aligned to a single product shell or visual system, and the current documentation does not yet define a clear release bar for onboarding other departments.

If other departments are added before those issues are resolved, the likely result is not a reusable platform. It is a larger surface area carrying the same data-quality risk, UX inconsistency, and operational ambiguity. Phase 1 therefore needs to produce a full-picture readiness assessment of the entire product, define the hard release gate for multi-department rollout, and turn that assessment into a practical program of work.

Current signals in the repo that support this framing include `docs/AUDIT-ISSUES-2026-02-21.md`, `docs/department-profile-schema-v1.md`, `docs/department-onboarding-qa-pack.md`, `js/supabase-config.js`, `js/db-service.js`, `js/department-profile.js`, `js/profile-loader.js`, `js/schedule-manager.js`, `pages/department-onboarding.js`, and `index.html`.

## Requirements

**Audit Coverage**
- R1. Phase 1 must audit the entire production product, including the live scheduler, all dashboards, shared navigation and shell patterns, onboarding and admin surfaces, documentation, and every production data path that informs user-visible behavior.
- R2. The audit must identify every production dependency on local JSON, localStorage, hardcoded defaults, embedded fallback data, or any other non-canonical runtime source.
- R3. The audit must identify every Design-specific assumption or single-department shortcut that would prevent safe reuse by other departments.
- R4. The audit must identify dashboard and page inconsistencies in layout, styling, navigation, states, and interaction patterns, and distinguish between superficial drift and issues that materially block product coherence.
- R5. The audit must evaluate documentation, QA flows, rollout checks, ownership, and change-management practices that affect the safety of production changes.

**Finding Model**
- R6. Findings must be organized under four readiness pillars: data truth, product consistency, platformization, and operational confidence.
- R7. Each finding must include clear impact, affected surface area, evidence, recommended outcome, and whether it blocks multi-department readiness.
- R8. Findings must roll up into a smaller number of actionable workstreams so the result is a decision artifact and not only a backlog dump.
- R9. The audit output must distinguish between foundational gaps, correctness risks, consistency issues, and documentation or process gaps.

**Release Gate**
- R10. Phase 1 must define a hard release gate for multi-department rollout.
- R11. The release gate must require all four readiness pillars to pass before any phase-2 other-department implementation work begins.
- R12. Release-gate criteria must be explicit, testable, and evidence-based rather than subjective.
- R13. For each gate criterion, the output must state what proof is required to mark it complete.
- R14. The release gate must make it possible to say "not ready yet" with specific reasons and named workstreams, rather than relying on intuition.

**Program Plan**
- R15. Phase 1 must synthesize the audit into a recommended program plan that sequences the work needed to clear the release gate.
- R16. The program plan must identify the major workstreams or epics, their dependencies, and the recommended order of operations.
- R17. The program plan must distinguish prerequisite stabilization work from later enhancements so the team can focus first on the smallest set of changes that create a trustworthy platform.
- R18. The program plan must make phase 2 legible by defining what "ready for other departments" means in operational terms.

**Documentation**
- R19. Phase 1 must produce durable documentation that captures the audit, the release gate, and the recommended work program in a form the team can reuse during planning and execution.
- R20. The documentation must be written for internal execution first, but remain clear enough to share with leadership or stakeholders without major rewriting.
- R21. The documentation must define the expected production source of truth for user-visible data and clarify what kinds of local or fallback behavior, if any, are still acceptable.
- R22. The documentation must clarify how other-department onboarding will be treated once phase 2 begins so the team does not reopen foundational decisions mid-rollout.

**Phase 2 Entry Conditions**
- R23. Phase 2 begins only after the hard release gate passes across all four readiness pillars.
- R24. Other-department work must be framed as onboarding onto a stabilized platform, not as a vehicle for discovering unresolved production-platform requirements.
- R25. The phase-1 output must make it clear which unresolved issues would still create unacceptable risk if another department were onboarded today.

## Success Criteria
- The team has a product-wide picture of what is preventing safe multi-department rollout today.
- The team can explain the readiness gap in a small number of clear workstreams instead of a scattered list of symptoms.
- The team has a hard, evidence-based release gate for deciding whether other-department work can start.
- The team has a recommended sequence for clearing that gate, with enough clarity to move directly into planning.
- Stakeholders can understand why multi-department support is being staged behind production readiness rather than treated as an immediate feature add.

## Scope Boundaries
- Phase 1 is an audit and program-definition effort, not an implementation effort.
- Phase 1 is not limited to scheduler correctness bugs; it includes data architecture, UX coherence, platform assumptions, and operating discipline.
- Phase 1 does not start onboarding another department, even in pilot form.
- Phase 1 does not attempt to solve every future multi-tenant need; it defines the bar required before that work can safely begin.

## Key Decisions
- Full-product scope: the audit should cover the entire production experience rather than only the current scheduler core.
- Audit plus release gate: phase 1 should not stop at findings; it must define the explicit readiness bar.
- Hard gate: all four pillars must pass before other-department implementation begins.
- Program-plan output: the most useful artifact is a readiness program that includes the audit, the gate, and the recommended workstream sequence.
- Internal-first but shareable: the document should drive team execution while still being readable by stakeholders.
- Single decision owner: release-gate sign-off belongs to the user as the sole builder and final decision-maker, with AI tools acting as execution support rather than separate approvers.

## Dependencies / Assumptions
- Existing repo artifacts already provide enough evidence to justify an audit-first framing, including the prior audit backlog in `docs/AUDIT-ISSUES-2026-02-21.md` and the current department-profile and onboarding docs.
- The current develop Supabase environment provides a safe place for future remediation and verification work, but phase 1 should not assume the database migration is complete everywhere user-visible behavior depends on it.
- Planning can verify the exact production/runtime boundaries and close any remaining uncertainty in the current-state evidence before implementation work is scoped.

## Outstanding Questions

### Resolve Before Planning
- [Affects R15-R18][Planning detail] Should the follow-on program plan include rough phase sizing and timeline expectations, or only sequence and dependency order?
- [Affects R4][Design bar] Should dashboard/style alignment aim for consistency with the existing scheduler shell, or is a broader visual-system refresh in scope if the audit finds the current shell is not strong enough to standardize around?
