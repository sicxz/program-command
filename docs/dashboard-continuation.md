# Dashboard continuation

Updated 2026-09-13. This records the navigation work requested on 2026-09-01
and resumed on 2026-09-13 under [dashboard epic #274](https://github.com/sicxz/program-command/issues/274).
The later user direction below supersedes the epic's original proposal to
absorb Applied Learning into Workload.

## Repository and entry point

- Active repository: `https://github.com/sicxz/program-command.git`.
- Main local checkout: `/Users/tmasingale/Developer/GitHub/scheduler-v2-codex`.
- Dashboard entry point: `program-command.html`. The site root is the public schedule.
- `/Users/tmasingale/Developer/GitHub/scheduler-v2` is the older
  `sicxz/schedule-ay-2025-26` checkout. Preserve its local changes and reports.
  Do not implement this dashboard work there.
- Temporary worktrees belong to the same active repository; they are not a
  second development repository. Confirm the origin before continuing.

## Agreed navigation

The schedule remains the main workspace. Analytics runs in this order:
**Applied Learning → Enrollment → Capacity**. **Workload** is a separate
feature, with Release Time alongside it.

The former Build/Planning tools are preserved under a closed **Archived
features** disclosure: Builder, AY Setup, Onboarding, EagleNet Compare,
Courses, Constraints, and Demand. Their pages and existing permissions remain
available. The active navigation opens by default; the Settings shortcuts
use the same analytics order and separate Workload grouping.

“Reset” refers to this product focus and navigation change. It does not mean
clearing schedules, local storage, Supabase, or source data. Advising is not
the next workstream; its existing implementation is preserved.

## Getting going again

1. Open `program-command.html` from the active repository. Select the prior
   academic year and use **Copy to Next Year** in the quarter navigation.
   Review the resulting schedule before saving any changes.
2. Work through **Applied Learning** first: reconcile supervision multipliers,
   release-time sources, and possible double counting. Keep the calculation
   contract consistent with the separate Workload feature. See
   [#183](https://github.com/sicxz/program-command/issues/183).
3. Continue with **Enrollment**: distinguish observed enrollment from estimated
   headcount, show source dates, and derive insights from the selected data.
   See [#276](https://github.com/sicxz/program-command/issues/276).
4. Continue with **Capacity** after its inputs are trustworthy: missing demand
   must produce an unavailable state, not “Within Baseline” or unused capacity.
   See [#279](https://github.com/sicxz/program-command/issues/279).

Steps 2 and 4 remain outstanding. Enrollment's presentation and recorded-count
contract have now been updated as described below; further source-pipeline
validation is separate from that work.

## Enrollment UI and data presentation

The user's follow-up narrowed the immediate work to visual readability and
what the data explains, especially the overlapping Winter course chart.
`enrollment-dashboard.html` now uses a dedicated controller, stylesheet and
pure view model. The main changes are:

- Quarterly registrations have direct labels, a same-quarter prior-year
  comparison, and an exact-count table. Missing matching records are gaps,
  while a recorded zero remains zero. A comparison requires observations in
  every paired quarter.
- Winter uses individual course charts on a shared scale with course titles,
  printed values and a data-derived takeaway. The 12 largest latest-Winter
  courses appear first; all Winter courses remain in the disclosure table.
  Winter covers all recorded winters regardless of the academic-year filter.
- Course-level and historical-trend filters now apply to the displayed data.
  Trend classifications still describe the full source history.
- Counts are course registrations, not unique students or declared majors.
  Source dates and partial-year coverage are explicit. Invented Winter 2026
  values and unsupported forecast/headcount/capacity panels were removed.

The source snapshot is unchanged: generated February 21, 2026, with records
through Fall 2025. The default is the latest complete academic year, 2024–25,
with 1,272 registrations. This does not supply live enrollment or validate
the upstream pipeline, student headcount, or capacity calculations.

Repository cleanup is a separate matter: do not delete recovery folders,
retire the old hosted site, close legacy PRs, or delete branches as part of
this change. Production publishing remains the human-run Deploy Pages
workflow described in `AGENTS.md`; a merged PR does not update the live site.
