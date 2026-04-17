# Department Onboarding QA Pack (M4 Release Gate)

This QA pack is the release gate for department onboarding rollout work.

## Current Status

This QA pack reflects the current onboarding shell and local-profile workflow. During the production-readiness program, it should be treated as a transitional QA artifact rather than proof that the platform is already ready for another department.

Another department should not be onboarded from this pack alone until the platformization and release-gate artifacts in `docs/audits/` pass.

The onboarding page now explicitly reports whether canonical program config was found in Supabase or whether the page is still operating in bootstrap local-profile mode. Treat bootstrap mode as setup-only, not release evidence.

For develop environments that should exercise the canonical runtime path, apply `scripts/supabase-program-config-seed-t07.sql` after the base schema setup so `ewu-design` exists in `public.programs` with a real runtime profile.

## 1) Regression Suite (Scheduler + Workload + CLSS)

Run before each onboarding rollout:

```bash
npm test
```

Coverage alignment:

- Scheduler/conflict critical path:
  - `tests/conflict-engine.slot-resolutions.test.js`
  - `tests/conflict-engine.regression-scenarios.test.js`
  - `tests/conflict-engine.room-fit-recommendations.test.js`
- Workload critical path:
  - `tests/workload-integration.test.js`
- Onboarding/profile management critical path:
  - `tests/department-profile.onboarding.test.js`

Manual CLSS import regression (required until CLSS parser is fully modularized for unit tests):

1. Open `/pages/department-onboarding.html` and activate a non-default profile.
2. Open CLSS import in scheduler and parse sample rows with:
   - at least one faculty alias match
   - at least one course alias match
   - at least one low-confidence row
3. Confirm review summary shows low-confidence count and per-row diagnostics.
4. Apply import and confirm results panel includes placement diagnostics sample.

## 2) Pilot Profile

Pilot profile file:

- `department-profiles/itds-pilot-v1.json`

Manifest registration:

- `department-profiles/manifest.json` includes `itds-pilot-v1`

Expected pilot onboarding outcome:

- Profile can be selected as onboarding base.
- Wizard can save a versioned profile (`<base>-vNN`) locally.
- Activated profile becomes the active runtime profile and survives reload.

## 3) Rollout SOP (Chair/Admin)

### Preconditions

Before using this SOP for a real additional department rollout:

1. The multi-department release gate in `docs/audits/multi-department-release-gate.md` must pass.
2. The platformization blockers in `docs/audits/multi-department-blockers.md` must be resolved for release-gated behavior.
3. The canonical runtime identity and profile source model must be documented.

### Preflight

1. Run `npm test` and verify all suites pass.
2. Run data drift check before carrying configuration between environments:
   - `npm run check:data-freshness -- --department <CODE> --year <YYYY-YY>`
3. Confirm backup/export of current active profile decisions (if any).

### Onboarding Execution

1. Open `pages/department-onboarding.html`.
2. Select base profile.
3. Enter identity and mapping inputs (rooms, faculty aliases, course aliases).
4. Run Health Checks.
5. Resolve all Errors (Warnings can proceed with explicit sign-off).
6. Click **Save Versioned Profile + Activate**.

### Post-Activation Verification

1. Reload app and confirm new profile remains active.
2. Verify scheduler headers/slots/rooms match profile settings.
3. Verify workload dashboard labels/targets align with profile.
4. Run one CLSS import dry run and confirm diagnostics output.

### Rollback

1. Reopen onboarding shell.
2. Select prior known-good profile version from base selector.
3. Activate prior version.
4. Re-run quick smoke (scheduler + workload + CLSS parse).

## 4) Handoff Artifacts

For each rollout, capture:

- activated profile id and timestamp
- health check output summary (errors/warnings/passes)
- data freshness report output JSON (if environment compare was run)
- smoke-test notes (scheduler/workload/CLSS)
