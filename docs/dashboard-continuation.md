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
- Course comparisons use individual charts on a shared scale with titles,
  printed values and a data-derived takeaway. The 12 largest courses in the
  latest recorded quarter appear first; all courses remain in the disclosure
  table. The comparison covers the selected season across all recorded years.
- Course-level and historical-trend filters now apply to the displayed data.
  Trend classifications still describe the historical dataset through Fall 2025.
- Counts are course registrations, not unique students or declared majors.
  Source dates and partial-year coverage are explicit. Invented Winter 2026
  values and unsupported forecast/headcount/capacity panels were removed.

The historical source snapshot is unchanged: generated February 21, 2026,
with records through Fall 2025. Enrollment now adds the dated EagleNET captures
below through an Enrollment-only overlay. This does not validate the upstream
pipeline, student headcount, or capacity planning calculations.

The academic-year selector defaults to **All recorded years**, following the
user's latest preference. **Automatic** remains available for the current
academic year. The course-comparison quarter defaults to **Automatic** and
continues following the current term. The pure resolver reads `data/academic-calendar.json`
in Pacific time, with verified EWU dates for 2025–26 and 2026–27. Active dates
include instruction and finals; during breaks the next term is labeled
**Upcoming**. Outside that published date range, the UI explicitly labels a
seasonal estimate. Extend the calendar from the registrar's official dates
when new years are published; never silently call approximate dates exact.

Automatic selections refresh when the page regains focus or visibility and
once per minute while open. Explicit year/quarter choices remain selected.
Missing current-year enrollment is shown as unavailable, while the comparison
still shows recorded history for the selected quarter. A date change does not
fabricate or import new enrollment records. Reloading revalidates the local
source snapshot and calendar rather than relying on a stale cached response.

Repository cleanup is a separate matter: do not delete recovery folders,
retire the old hosted site, close legacy PRs, or delete branches as part of
this change. Production publishing remains the human-run Deploy Pages
workflow described in `AGENTS.md`; a merged PR does not update the live site.


## 2026 EagleNET registration captures

The user authorized reading their signed-in EWU registration search on
September 13, 2026. The complete **Design** subject search returned:

| Quarter | Term code | Sections | Registrations | Section capacity |
| --- | --- | ---: | ---: | ---: |
| Winter 2026 | 202610 | 39 | 365 | 485 |
| Spring 2026 | 202620 | 39 | 338 | 458 |
| Fall 2026 | 202640 | 23 | 308 | 370 |

`data/enrollment-registration-snapshots.json` retains all 101 unique term/CRN
records, their section titles, available seats, capacity and displayed waitlist
counts. Search completeness was checked at 50 rows per page with no next page.
Enrollment/Waitlist details for CRNs 11091, 20538 and 40438 verified that actual
enrollment equals capacity minus available seats. Fall has 8 displayed waitlist
entries; five sections do not expose waitlist counts, retained as null.

Capture completed September 13, 2026 at 8:25 AM Pacific. These are saved
registration search snapshots, not a live connection or official census counts.
Winter/Spring are completed terms in AY 2025–26. Fall is provisional in AY
2026–27; its status remains provisional until replaced by a newer reviewed
capture. The date resolver never converts a provisional capture to final data.

`EnrollmentViewModel` applies complete term captures only within Enrollment,
replacing any same-term totals rather than adding duplicate snapshots. The
historical source JSON and legacy planning inputs remain untouched. Do not append
captures to `enrollment-data/processed/*.csv` or run the processor blindly: it
reads every CSV and does not deduplicate term/CRNs; planning consumers also lack
provisional-term filtering. The old `data/winter-2026-enrollments.json` is a
separate December 2025 preregistration snapshot, not these completed-term counts.

All recorded years now totals **5,049 registrations**, 42 courses, 13 recorded
quarters. AY 2025–26 has 1,071 registrations across Fall/Winter/Spring. Provisional
counts are labeled in totals and tables and drawn as isolated amber points;
comparisons with provisional endpoints are withheld. The snapshot panel and its
section table show the complete source independently of the dashboard filters.


## Section cap as of 2026

On September 13, 2026, the user clarified that sections are capped at
**20 students as of 2026**. Enrollment displays this program context beside the registration
definition and explains that section counts and caps affect comparisons.
Do not attribute an enrollment change to this policy without supporting evidence.
The user specified 2026, without naming a particular quarter. Preserve that
year-level context; do not invent a quarter or rewrite captured section limits.

EagleNET snapshot cards and the section table label capacity as **recorded**.
Preserve all captured section limits, including limits above 20 and the smaller
internship / directed-study limits. This note does not change registration totals,
source data, planning calculations, or the all-recorded-years default.

## Capacity dashboard alignment

Capacity now shares Enrollment's navigation, typography, filter styling and
responsive panels. It defaults to **All recorded years**, showing a separate row
for each academic year rather than adding annual capacities together. Select a
year for faculty targets, workload coverage and unassigned sections. Automatic
year/quarter options reuse Enrollment's EWU/Pacific calendar resolver.

The old controller reported 324 credits available when workload dictionaries
were empty, ignored the quarter filter, and invented student ratios and a 5%
forecast. These displays are removed. `CapacityViewModel` keeps missing workload
unknown and compares credits only with credits. A quarter filter scopes actual
workload records; annual targets are never divided into quarter limits.

`WorkloadIntegration` provides the same saved schedule/import, AY Setup and
faculty detail sources as Workload. Capacity reads these sources without
initializing or importing a new schedule. Drafts may be incomplete; neither a
short bar nor target minus recorded workload establishes confirmed availability.
Inactive/former assignments, adjunct teaching and unresolved sections remain in
demand but do not add to the active full-time target. Fully released faculty
retain a zero net target. Applied-learning toggles use weighted workload, and
counts are labeled workload records because manual faculty detail entries are
not independently verified sections.

Historical enrollment `capacityPlanning.fullTimeFaculty` entries are used only
as recorded annual target configurations when no current roster/draft exists.
They may already contain adjustments; their gross/net and release basis is not
verified. Never use the legacy load/demand fields: they mix student and credit
units. EagleNET captures contain no instructor assignment data and cannot
establish faculty workload. The 20-student policy remains seat context with a
link to Enrollment.

Validation: 31 Capacity tests (pure calculations and page behavior), the full
48-suite / 359-test run, and the existing Vite build pass. Browser checks cover
the all-years default, historical targets, missing sources, and period filters.

## Applied Learning dashboard alignment

Applied Learning now shares Enrollment's shell and Capacity's source discipline.
The default is **All recorded years** with all quarters and all configured
applied-learning courses. Year, quarter and course filters affect both
registrations and supervision records. Automatic year/quarter selections use
the shared EWU/Pacific calendar, including the upcoming term during breaks.

Registration activity reuses `EnrollmentViewModel` with the existing historical
source and complete EagleNET captures. For the active Design profile, all
recorded years contains **468 registrations** across 13 quarters: DESN 399 = 21,
DESN 491 = 17, DESN 495 = 165, DESN 499 = 265. Historical records contribute 412;
Winter 2026 adds 21, Spring adds 29, and provisional Fall adds 6. These are course
seats, not unique students. No enrollment source files are changed.

Supervision uses exact-year `WorkloadIntegration` course records and unresolved
assignments, preserving explicit weighted workload and saved manual rates.
Missing records remain unavailable. Schedule entries contain course credits;
manual entries contain student-credit inputs. Raw inputs stay in the detail
table and are not presented as a combined student-credit total. Workload-record
counts do not claim distinct students or verified sections.

Do not consume `faculty.appliedLearning.students`: the integration summary falls
back to credits when students are missing. Do not promote
`workloadData.appliedLearningTrends` to actual supervision data: its calculator
assumes one student per section and five credits, omits DESN 399, and carries a
different DESN 491 rate. The dashboard preserves active-profile defaults and
explicit record rates rather than changing those shared policies. Registration
counts are never converted into supervision workload. Invalid/missing optional
capture data is excluded with a warning while healthy historical data remains.

Validation: 27 Applied Learning tests, including actual Enrollment and
WorkloadIntegration fixtures; 50 suites / 386 tests pass. Vite build passes.
Browser checks confirm 468 registrations, current Fall Internship = 3 provisional
registrations, unavailable supervision, filter behavior and no page overflow.

## Next: Workload (paused; under development)

The user requested that Workload be disabled while it awaits the same dashboard
reset. Workload links now open an **Under development** dialog. The direct
Workload URL serves a status page and does not load the legacy controller.
Schedule handoff buttons also show the notice before saving or navigating.
Existing workload data, integration/calculation modules, and the legacy
controller remain intact.

Follow-up work before re-enabling:
- Align Workload's UI and academic-year/quarter filters with the other dashboards.
- Explain each faculty member's annual target, releases, teaching and supervision.
- Trace missing workload records and verify the schedule/import/detail connection.
- Reconcile labels, sources and filtered totals across all four dashboards.

Re-enable deliberately after that work is verified: replace the status page with
the completed dashboard, remove `workload-notice.js` loading and unavailable
attributes, and restore reviewed navigation/handoff behavior. Do not re-enable
merely because source data changes or a new academic year begins.
