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


## Fall 2026 refresh, September 15

Travis, signed in to EagleNET on September 15, 2026, asked for Fall 2026 course
information and enrollment totals to be refreshed from the source of truth
(issue #302). The complete **Design** subject search for term 202640 was read
as Banner's own search JSON (23 sections, one page at 50 per page), which
carries exact enrollment rather than capacity minus seats available, plus
instructor, meeting pattern, campus, and schedule type. Those fields were added
to the Fall 2026 sections in `data/enrollment-registration-snapshots.json`;
the term stays provisional.

| Capture | Sections | Registrations | Section capacity | Displayed waitlist |
| --- | ---: | ---: | ---: | ---: |
| September 13, 2026 | 23 | 308 | 370 | 8 |
| September 15, 2026 | 23 | 300 | 362 | 9 |

Twelve sections are full. Banner publishes rooms for only two sections
(DESN 359 in Patterson Hall 118, DESN 496 in Art Building 108). All recorded
years now total 5,041 registrations; the two enrollment test files were updated
to the new capture.

### Reconciliation against the AY 2026-27 Fall schedule

Program Command stores its own section numbers in `scheduled_courses`, so
sections were matched by course plus meeting pattern, not by section number.
23 Banner sections, 18 scheduled sections, 16 matched.

Differences that need a decision:

- **DESN 100:** Banner lists Simeon Mills (MW 16:00-18:20, full at 23); the schedule lists A. Sopu for that slot. One of them is wrong.
- **DESN 200:** the schedule has two sections (C. Manikoth MW 10:00-12:20 and S. Mills TR 10:00-12:20); Banner has only the Mills section (24 of 24). The Manikoth section is not offered in Banner.
- **DESN 359:** Banner has it in Patterson Hall 118; the schedule assigns 210 Mac Lab.
- **Caps:** Banner caps run 18 to 24 while every scheduled course carries a typical cap of 24. The 20-student cap note from September 13 does not match Banner for most sections.
- **Not on the grid, by design:** DESN 491, the four DESN 495 internship sections, DESN 496 (Hewitt, Papermaking), and DESN 499 are arranged or experimental sections with no meeting slot.
- **Schedule rows with no Banner match:** ITGS 110 sec 003 (S.Mills, MW 10:00-12:20); DESN 200 sec 013 (C.Manikoth, MW 10:00-12:20). ITGS 110 is outside the Design subject search.

| CRN | Course / sec | Banner instructor | Banner meeting | Cap / enrolled | Schedule row (sec, faculty, days, time, room) | Note |
|---|---|---|---|---|---|---|
| 40436 | DESN 100 / 001 | Mills, Simeon | MW 1600-1820 | 23 / 23 | 002, A.Sopu, MW 16:00-18:20, 212 Project Lab | **instructor differs: schedule has A.Sopu**; Banner cap 23, typical cap 24; no room in Banner |
| 40438 | DESN 200 / 001 | Mills, Simeon | TT 1000-1220 | 24 / 24 | 017, S.Mills, TR 10:00-12:20, CEB 102 | no room in Banner |
| 40440 | DESN 216 / 001 | Sopu, Ariel | MW 1300-1520 | 22 / 22 | 007, A.Sopu, MW 13:00-15:20, CEB 102 | Banner cap 22, typical cap 24; no room in Banner |
| 40441 | DESN 216 / 025 | Sopu, Ariel | Arranged | 22 / 22 | 001, A.Sopu, ONLINE async, - | Banner cap 22, typical cap 24; no room in Banner |
| 40442 | DESN 243 / 001 | Durr, Sonja | TT 1000-1220 | 20 / 12 | 014, S.Durr, TR 10:00-12:20, 210 Mac Lab | Banner cap 20, typical cap 24; no room in Banner |
| 40443 | DESN 263 / 001 | Hustrulid, Ginelle | MW 1000-1220 | 20 / 14 | 001, G.Hustrulid, MW 10:00-12:20, 209 Mac Lab | Banner cap 20, typical cap 24; no room in Banner |
| 40444 | DESN 301 / 001 | Mills, Simeon | MW 1300-1520 | 24 / 24 | 006, S.Mills, MW 13:00-15:20, 210 Mac Lab | no room in Banner |
| 40445 | DESN 326 / 001 | Hustrulid, Ginelle | TT 1300-1520 | 24 / 24 | 015, G.Hustrulid, TR 13:00-15:20, 209 Mac Lab | no room in Banner |
| 40446 | DESN 338 / 001 | Poosri, Tyreil | MW 1600-1820 | 22 / 21 | 001, T.Poosri, MW 16:00-18:20, 206 UX Lab | Banner cap 22, typical cap 24; no room in Banner |
| 40447 | DESN 359 / 001 | Durr, Sonja | TT 1300-1520 | 18 / 16 | 018, S.Durr, TR 13:00-15:20, 210 Mac Lab | Banner cap 18, typical cap 24; **room: Banner Patterson Hall 118, schedule 210 Mac Lab** |
| 40448 | DESN 368 / 001 | Masingale, Travis | MW 1300-1520 | 20 / 14 | 001, T.Masingale, MW 13:00-15:20, 206 UX Lab | Banner cap 20, typical cap 24; no room in Banner |
| 40449 | DESN 369 / 001 | Manikoth, Colin | TT 1000-1220 | 20 / 6 | 012, C.Manikoth, TR 10:00-12:20, 206 UX Lab | Banner cap 20, typical cap 24; no room in Banner |
| 40450 | DESN 374 / 001 | Masingale, Travis | TT 1000-1220 | 20 / 11 | 011, T.Masingale, TR 10:00-12:20, 209 Mac Lab | Banner cap 20, typical cap 24; no room in Banner |
| 40452 | DESN 463 / 001 | Durr, Sonja | MW 1300-1520 | 23 / 23 | 008, S.Durr, MW 13:00-15:20, 209 Mac Lab | Banner cap 23, typical cap 24; no room in Banner |
| 40453 | DESN 480 / 001 | Manikoth, Colin | TT 1300-1520 | 20 / 17 | 016, C.Manikoth, TR 13:00-15:20, 206 UX Lab | Banner cap 20, typical cap 24; no room in Banner |
| 40454 | DESN 490 / 001 | Breen, Melinda | MW 1000-1220 | 20 / 13 | 001, M.Breen, MW 10:00-12:20, 210 Mac Lab | Banner cap 20, typical cap 24; no room in Banner |
| 40455 | DESN 491 / 001 | Breen, Melinda | Arranged | 5 / 0 | - | not on the grid: Thesis or Research Project / Spokane U-District |
| 42216 | DESN 495 / 002 | Hustrulid, Ginelle | Arranged | 1 / 1 | - | not on the grid: Internship |
| 42217 | DESN 495 / 003 | Breen, Melinda | Arranged | 1 / 1 | - | not on the grid: Internship |
| 42277 | DESN 495 / 004 | Breen, Melinda | Arranged | 1 / 0 | - | not on the grid: Internship |
| 42873 | DESN 495 / 005 | Breen, Melinda | Arranged | 1 / 1 | - | not on the grid: Internship |
| 42102 | DESN 496 / 001 | Hewitt, Melanie | F 0900-1150 | 8 / 8 | - | not on the grid: Experimental (96's) |
| 42164 | DESN 499 / 001 | Durr, Sonja | Arranged | 3 / 3 | - | not on the grid: Independent Study |

The schedule itself was not edited; the differences above are for Travis to
resolve against EagleNET.

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

## Workload trace: MasingaleT, 2025-26

### Path

- Identity: `MasingaleT_Wkld_2526_20May2025.xlsx` cell `A2` contains
  `Masingale Travis`, but the generator's source file is
  `enrollment-data/processed/corrected-all-quarters.csv`: its `Instructor`
  column would feed `normalizeFacultyName()` and
  `generateWorkloadReportByYear()` -> the intended JSON key is
  `workloadByYear.byYear["2025-26"].all["Travis Masingale"].facultyName` ->
  `js/year-filter.js:getYearData()` ->
  `js/workload-integration.js:buildIntegratedWorkloadYearData()` field
  `record.facultyName` -> `pages/faculty-workload-detail.js:getFacultyOptionsForYear()`
  -> `#facultySelect`. All 360 CSV rows have a blank `Instructor`, including all
  29 rows for 2025-26, so `generateWorkloadReport()` returns early at
  `if (!instructor) return;` for every row and never creates the JSON key.
  Independently, `pages/faculty-workload-detail.html` does not load
  `js/year-filter.js`, so `getYearData` is unavailable and
  `buildIntegratedWorkloadYearData()` always uses the empty `baseYearData`
  fallback on that page. Even a populated JSON key would not reach
  `#facultySelect` through the integrated record.
- Courses: workbook cells `B2:J4` contain six named scheduled-course rows and
  three `DESN X95/99` aggregate rows, with workload credits in `D2:D4`,
  `G2:G4`, and `J2:J4` -> `calculateFacultyWorkload()` would emit
  `courses[]` -> `applyBaseFacultyData()` copies `baseData.courses` and
  `recalcFacultyRecord()` reads each course -> `renderEntries()` renders rows
  in `#entriesBody`. The page does not read integrated `courses[]`; it renders
  separate detail entries from `getFacultyWorkloadDetailEntries()`, so the
  workbook rows do not reach that UI element.
- Totals: workbook formula `K8` is `SUM(D8:J8)` with cached value `36`, and
  `P2` is `36` -> `calculateFacultyWorkload()` would emit
  `totalWorkloadCredits`, while `calculateUtilization()` would emit
  `maxWorkload` and `currentWorkload` -> `recalcFacultyRecord()` sets
  `record.utilizationRate` and `record.availableCapacity` -> `renderSummary()` writes
  `#totalWorkloadCredits`. That UI value is instead calculated from detail-entry
  `studentCredits * workloadRate`; it does not read the integrated faculty
  record.
- Generated snapshot: `workload-data.json` was generated at
  `2026-02-26T05:55:14.528Z`; its `facultyWorkload` and `fullTimeFaculty` objects
  are empty, and every object under `workloadByYear.byYear`, including
  `"2025-26"`, is empty. `package.json:calculate-workload` runs
  `scripts/workload-calculator.js enrollment-data/processed`, whose only CSV is
  `corrected-all-quarters.csv`; the blank `Instructor` values explain why the
  faculty objects are empty while `appliedLearningTrends` and
  `summary.totalSections: 360` are populated. The chair workbook is therefore a
  source and reconciliation record, not an input that the current generator
  consumed.

### Field table

| Field | Read by | Source of record | Present for MasingaleT 2025-26? | Status |
| --- | --- | --- | --- | --- |
| `facultyName` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | `corrected-all-quarters.csv:Instructor`; workbook `A2` and `faculty-mapping.json:nameNormalization` identify the chair record | partial — workbook `Masingale Travis` maps to `Travis Masingale`, but all 29 CSV rows for 2025-26 have blank `Instructor`, so the JSON faculty key is absent | Source identity exists outside the generator input; generated record missing |
| `originalName` | `js/workload-integration.js:applyBaseFacultyData()` | Workbook `A2` | yes — `Masingale Travis` | Available in the workbook only |
| `rank` | `js/workload-integration.js:applyBaseFacultyData()` and `buildIntegratedWorkloadYearData()` | `faculty-mapping.json:facultyRanks`, workbook `A1`, browser localStorage key `programCommandAySetup`, and `DEFAULT_PRELIMINARY_ROSTER_TARGET_RULES` rule `travis-tenure` | partial — mapping says `Associate Professor`, workbook says `Tenured/Tenure-track`, and the fallback says `Full Professor`; the browser's AY Setup value is not knowable from repository files | If a Travis record exists and the browser has no matching `programCommandAySetup["2025-26"]` entry, the fallback wins in the integrated record's `rank`; no current UI element displays rank |
| `category` | `js/workload-integration.js:applyBaseFacultyData()` | `faculty-mapping.json:facultyStatusByYear["2025-26"].fullTime` | yes — `Travis Masingale` is listed | Available to the generator; generated record missing |
| `maxWorkload` | `js/workload-integration.js:applyBaseFacultyData()`, `buildIntegratedWorkloadYearData()`, and `recalcFacultyRecord()` | `faculty-mapping.json:individualCapacities["2025-26"]`; workbook `P2`; `DEFAULT_PRELIMINARY_ROSTER_TARGET_RULES` rule `travis-tenure.annualTargetCredits` | partial — all three sources say `36`, and the fallback writes `36`, but the JSON faculty record is absent | Available from source and fallback; generated field missing |
| `manualOverride` | `js/workload-integration.js:applyBaseFacultyData()` | Generated faculty record | no — no value in the workbook or mapping | Missing base-record metadata |
| `manualOverrideNote` | `js/workload-integration.js:applyBaseFacultyData()` | Generated faculty record | no — no value in the workbook or mapping | Missing base-record metadata |
| `displayName` | `js/workload-integration.js:listFacultyNamesFromDetailEntries()` and `buildIntegratedWorkloadYearData()` | Browser localStorage key `programCommandFacultyWorkloadDetails`; workbook `A2` supplies the source name | partial — `Masingale Travis` is present in the workbook, but repository files cannot establish whether the browser-local detail bucket exists | The detail page writes it through `saveEntries()` -> `saveFacultyWorkloadDetailEntries()` |
| `entries` | `js/workload-integration.js:getFacultyWorkloadDetailEntries()` and `buildIntegratedWorkloadYearData()` | Browser localStorage key `programCommandFacultyWorkloadDetails` | partial — repository files cannot establish whether the current browser has saved MasingaleT entries | The detail page writes them through `saveEntries()` -> `saveFacultyWorkloadDetailEntries()` |
| `courses` | `js/workload-integration.js:applyBaseFacultyData()` and `recalcFacultyRecord()` | Workbook quarter rows | partial — nine displayed rows, but three are aggregated as `DESN X95/99` and the JSON `courses` array is absent | Workbook snapshot cannot be copied as a complete course array |
| `id` | `js/workload-integration.js:recalcFacultyRecord()` | Course record | no — workbook rows have no IDs | Integration would generate unstable fallback IDs |
| `courseCode` / `code` | `js/workload-integration.js:recalcFacultyRecord()` | Workbook `B2:B4`, `E2:E4`, `H2:H4` | partial — scheduled codes are present; `DESN X95/99` does not identify the underlying `DESN 399/491/495/499` records | Applied-learning codes must be restored before integration |
| `assignedFaculty` / `instructor` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Per-course schedule/import record; workbook `A2` identifies the sheet owner | partial — the sheet is for `Masingale Travis`, but the individual rows have no faculty field | Each imported course needs an explicit assignment |
| `section` | `js/workload-integration.js:recalcFacultyRecord()` | Workbook notes/section cells `C2:C7`, `F2:F7`, `I2:I7` | no — the populated course rows have blank section cells | Integration would default to `001`, which is not source evidence |
| `credits` | `js/workload-integration.js:recalcFacultyRecord()` | Workbook workload-credit columns and underlying course records | partial — scheduled rows show `5`; `DESN X95/99` rows show workload-equivalent `2`, not raw student credits | Scheduled credits are usable; applied-learning raw credits are missing |
| `studentCredits` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Saved faculty detail entry | no — the workbook has only the aggregate `DESN X95/99` workload-equivalent values | Required by the detail-entry bridge and `renderSummary()` |
| `workloadRate` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Saved faculty detail entry | no — the workbook has no applied-learning rate | Required by the detail-entry bridge and `renderSummary()` |
| `enrolled` / `students` | `js/workload-integration.js:recalcFacultyRecord()` | Enrollment or detail-entry course record | no — workbook has no enrollment/student counts | Missing course detail |
| `multiplier` | `js/workload-integration.js:recalcFacultyRecord()` | Course record or `getAppliedLearningRate()` | no — workbook has no rate, and `DESN X95/99` is not a configured applied-learning code | Cannot reproduce the aggregate from raw credits |
| `type` | written by `js/workload-integration.js:recalcFacultyRecord()` | Derived from whether `multiplier < 1` | no — no generated course objects exist; the workbook does not label rows `scheduled` or `applied-learning` | Computed course field missing with `courses[]` |
| `workloadCredits` | `js/workload-integration.js:recalcFacultyRecord()` | Workbook `D2:D4`, `G2:G4`, `J2:J4` | yes — each quarter has `5`, `5`, and `2` | Present as displayed workload values; generated course objects missing |
| `quarter` | `js/workload-integration.js:recalcFacultyRecord()` | Workbook headers `B1`, `E1`, `H1` | yes — Fall 2025, Winter 2026, Spring 2026 | Present in the workbook layout |
| `notes` | `js/workload-integration.js:recalcFacultyRecord()` | Workbook notes/section cells | no — the populated course rows have blank notes | Missing optional course detail |
| `source` | `js/workload-integration.js:recalcFacultyRecord()` | Generated or integrated course record | no — workbook rows carry no source tag | Integration would default to `integrated` |
| `totalCredits` | written by `js/workload-integration.js:recalcFacultyRecord()` | Raw course `credits` | no — workbook `K8` is workload, while applied-learning raw credits are absent | Cannot calculate the raw-credit total |
| `totalWorkloadCredits` | written by `scripts/workload-calculator.js:calculateFacultyWorkload()` and `js/workload-integration.js:recalcFacultyRecord()` | Workbook formula `K8` | partial — cached source value is `36`, but the generated JSON field is absent | Source total exists; generated field missing |
| `scheduledCredits` | written by `scripts/workload-calculator.js:calculateFacultyWorkload()` and `js/workload-integration.js:recalcFacultyRecord()` | Six scheduled workbook rows | partial — six `5`-credit rows imply `30`, but no `scheduledCredits` field is stored | Derivable from the workbook; generated field missing |
| `appliedLearningCredits` | written by `scripts/workload-calculator.js:calculateFacultyWorkload()` and `js/workload-integration.js:recalcFacultyRecord()` | Underlying applied-learning course records | no — workbook stores only three `DESN X95/99` workload-equivalent values | Raw applied-learning credits are missing |
| `appliedLearningWorkload` | written by `scripts/workload-calculator.js:calculateFacultyWorkload()` and `js/workload-integration.js:recalcFacultyRecord()` | Workbook `DESN X95/99` rows | partial — three `2`-credit workload values total `6`, but the underlying course codes and rates are absent | Reconciliation total only; generated field missing |
| `totalStudents` | written by `scripts/workload-calculator.js:calculateFacultyWorkload()` and `js/workload-integration.js:recalcFacultyRecord()` | Course `enrolled` or `students` | no — workbook has neither | Generated field missing with course detail |
| `sections` | written by `scripts/workload-calculator.js:calculateFacultyWorkload()` and `js/workload-integration.js:recalcFacultyRecord()` | Course rows | partial — six scheduled rows are distinct, but each `DESN X95/99` row aggregates an unknown number of records | Displayed-row count is not a section count; generated field missing |
| `appliedLearning` | written by `js/workload-integration.js:recalcFacultyRecord()` | Underlying applied-learning records grouped by configured course code | no — workbook combines them as `DESN X95/99` | Structured course-code buckets cannot be rebuilt |
| `byQuarter` | written by `js/workload-integration.js:recalcFacultyRecord()` | Course `quarter`, `credits`, and `workloadCredits` | partial — quarter workload totals are `12`, `12`, and `12`, but raw applied-learning credits and section counts are missing | Workload can be reconciled; generated field missing |
| `currentWorkload` | written by `js/workload-integration.js:recalcFacultyRecord()` | Calculated from `totalWorkloadCredits` | partial — the source implies `36`, but no faculty record exists to receive it | Computable after record creation; generated field missing |
| `utilizationRate` | written by `js/workload-integration.js:recalcFacultyRecord()` | Calculated from `totalWorkloadCredits / maxWorkload` | partial — `36 / 36` implies `100`, but no JSON faculty record exists | Computable after record creation; generated field missing; workbook percentages use a separate 45-credit summary denominator |
| `availableCapacity` | written by `js/workload-integration.js:recalcFacultyRecord()` | Calculated from `maxWorkload - totalWorkloadCredits` | partial — `36 - 36` implies `0`, but no JSON faculty record exists | Computable after record creation; generated field missing |
| `status` | written by `js/workload-integration.js:recalcFacultyRecord()` | Calculated from `utilizationRate` | partial — an integration rate of `100` implies `optimal`, but the workbook does not store the field and JSON has no faculty record | Computed field missing with the record |
| `specialRole` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser AY Setup `isChair`/`releaseReason`, preliminary roster rule `specialRole`; separately, `scripts/workload-calculator.js:getChairAssignment()` and `calculateFacultyWorkload()` read `faculty-mapping.json:chairAssignments` but do not emit `specialRole` | partial — calendar keys `fall-2025`, `winter-2026`, and `spring-2026` name `Melinda Breen`; the generator instead constructs `quarter + '-' + academicYear.split('-')[0]`, so Winter 2025-26 resolves to `winter-2025`, which names `Travis Masingale` with `releaseTime: "none"`; the browser's AY Setup value is unknown, and the `travis-tenure` fallback has no `specialRole` | Key conventions conflict: `calculateFacultyWorkload()` marks Winter courses `chairThisQuarter: true` and excludes DESN 495/499 from its total, but `recalcFacultyRecord()` discards that flag and re-sums finite course `workloadCredits`; WorkloadIntegration assigns `Chair` only from browser AY Setup or a matching fallback rule |
| AY Setup `name` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser localStorage `programCommandAySetup["2025-26"].faculty[]` | partial — repository files cannot establish whether the current browser has this entry | Entered in AY Setup and written by `js/academic-year-setup.js:saveStore()`; needed to match Travis's identity |
| AY Setup `role` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser localStorage `programCommandAySetup["2025-26"].faculty[]` | partial — repository files cannot establish whether the current browser has this entry | Entered in AY Setup and written by `saveStore()`; `travis-tenure.role` falls back to `Full Professor` only when the entry is absent |
| AY Setup `annualTargetCredits` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser localStorage `programCommandAySetup["2025-26"].faculty[]` | partial — repository files cannot establish whether the current browser has this entry | Entered in AY Setup and written by `saveStore()`; `travis-tenure.annualTargetCredits` falls back to `36` only when the entry is absent |
| AY Setup `releaseCredits` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser localStorage `programCommandAySetup["2025-26"].faculty[]` | partial — repository files cannot establish whether the current browser has this entry | Entered in AY Setup and written by `saveStore()`; `travis-tenure.releaseCredits` falls back to `0` only when the entry is absent |
| AY Setup `releasePercent` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser localStorage `programCommandAySetup["2025-26"].faculty[]` | partial — repository files cannot establish whether the current browser has this entry | Entered in AY Setup and written by `saveStore()`; the fallback path computes `0` from `0 / 36` only when the entry is absent |
| AY Setup `releaseReason` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser localStorage `programCommandAySetup["2025-26"].faculty[]` | partial — repository files cannot establish whether the current browser has this entry | Entered in AY Setup and written by `saveStore()` to derive `ayReleaseReason` and potentially `specialRole` |
| AY Setup `notes` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser localStorage `programCommandAySetup["2025-26"].faculty[]` | partial — repository files cannot establish whether the current browser has this entry | Entered in AY Setup and written by `saveStore()` to derive `ayNotes` |
| AY Setup `active` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser localStorage `programCommandAySetup["2025-26"].faculty[]` | partial — repository files cannot establish whether the current browser has this entry | Entered in AY Setup and written by `saveStore()` to derive `ayActive` |
| AY Setup `isChair` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser localStorage `programCommandAySetup["2025-26"].faculty[]` | partial — repository files cannot establish whether the current browser has this entry | Entered in AY Setup and written by `saveStore()`; with `releaseReason`, it can derive `specialRole` |
| `ayRole` | written by `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser AY Setup `role` or `travis-tenure.role` fallback | partial — browser AY Setup state is unknown; if no matching entry exists, a created integrated record gets fallback `Full Professor` | No current UI element displays this field |
| `ayTargetCredits` | written by `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser AY Setup `annualTargetCredits` or `travis-tenure.annualTargetCredits` fallback | partial — browser AY Setup state is unknown; if no matching entry exists, a created integrated record gets fallback `36` | No current UI element displays this field |
| `ayReleaseCredits` | written by `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser AY Setup `releaseCredits` or `travis-tenure.releaseCredits` fallback | partial — browser AY Setup state is unknown; if no matching entry exists, a created integrated record gets fallback `0` | No current UI element displays this field |
| `ayNetTargetCredits` | written by `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser AY Setup target minus release, or `travis-tenure` fallback | partial — browser AY Setup state is unknown; if no matching entry exists, a created integrated record gets fallback `36` | No current UI element displays this field |
| `ayReleasePercent` | written by `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser AY Setup `releasePercent` or calculated release/target ratio | partial — browser AY Setup state is unknown; if no matching entry exists, a created integrated record gets fallback `0` | No current UI element displays this field |
| `ayReleaseReason` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser AY Setup `releaseReason` | partial — repository files cannot establish whether the current browser supplies it; `travis-tenure` does not | Missing from an integrated record only when the browser entry is absent or empty |
| `ayNotes` | `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser AY Setup `notes` | partial — repository files cannot establish whether the current browser supplies it; `travis-tenure` does not | Missing from an integrated record only when the browser entry is absent or empty |
| `ayActive` | written by `js/workload-integration.js:buildIntegratedWorkloadYearData()` | Browser AY Setup `active` | partial — repository files cannot establish whether the current browser supplies it; `travis-tenure` does not | Missing from an integrated record only when the browser entry is absent |

### Missing fields

Because `workloadByYear.byYear["2025-26"].all` is `{}`, every generated faculty
field below is absent even when the workbook, mapping, or fallback provides a
source value.

- `facultyName`: fill `Instructor` on the 29 2025-26 rows in `enrollment-data/processed/corrected-all-quarters.csv`; `generateWorkloadReport()` currently skips all of them before it can emit the normalized `Travis Masingale` key.
- `originalName`: carry workbook `A2` (`Masingale Travis`) into the generated base record.
- `rank`: resolve the three-way conflict among workbook `A1` (`Tenured/Tenure-track`), `facultyRanks` (`Associate Professor`), and `travis-tenure.role` (`Full Professor`); the fallback wins in the integrated record only if browser localStorage has no matching `programCommandAySetup["2025-26"]` entry.
- `category`: carry the `facultyStatusByYear["2025-26"].fullTime` classification into the generated record.
- `maxWorkload`: carry the shared source/fallback value `36` into the generated record.
- `manualOverride`: supply it through generated faculty metadata if an override is intended.
- `manualOverrideNote`: supply it with the corresponding generated `manualOverride` metadata.
- `displayName`: if the browser's `programCommandFacultyWorkloadDetails` key lacks the bucket, use the detail page's `saveEntries()` -> `saveFacultyWorkloadDetailEntries()` path to save the workbook identity or normalized name.
- `entries`: if absent from browser localStorage, save underlying applied-learning records through `saveFacultyWorkloadDetailEntries()` on the detail page.
- `courses`: first fill `Instructor` on the 2025-26 `corrected-all-quarters.csv` rows so the calculator groups its unaggregated course records under Travis; Program Command schedule or browser detail entries are the other sources read by `buildIntegratedWorkloadYearData()`.
- `id`: supply stable IDs on those course or detail records.
- `courseCode` / `code`: replace each `DESN X95/99` aggregate with its underlying `DESN 399/491/495/499` records.
- `assignedFaculty` / `instructor`: identify `Travis Masingale` on each schedule/import course rather than only at workbook level.
- `section`: supply actual section identifiers from enrollment or schedule records; the workbook cells are blank.
- `credits`: supply raw applied-learning student credits; the workbook rows contain workload-equivalent values.
- `studentCredits`: supply raw credits in saved applied-learning detail entries.
- `workloadRate`: supply the saved detail rate or an exact code recognized by `getAppliedLearningRate()`.
- `enrolled` / `students`: supply counts from enrollment or saved detail records.
- `multiplier`: supply a recorded `workloadRate` or an exact applied-learning code.
- `type`: let `recalcFacultyRecord()` classify each generated course as `scheduled` or `applied-learning` from its multiplier.
- `workloadCredits`: carry the workbook's per-row workload values into generated course objects or recalculate them from raw records.
- `quarter`: carry Fall 2025, Winter 2026, and Spring 2026 from the workbook headers into generated course objects.
- `notes`: supply optional notes from a schedule/detail source; the workbook note cells are blank.
- `source`: tag each generated or integrated course with its actual source.
- `totalCredits`: recalculate it from complete raw `credits` records.
- `totalWorkloadCredits`: persist the workbook reconciliation value `36` only after `calculateFacultyWorkload()` reproduces it.
- `scheduledCredits`: sum the six scheduled workbook rows to `30` once course records feed `calculateFacultyWorkload()`.
- `appliedLearningCredits`: sum raw credits from unaggregated applied-learning records.
- `appliedLearningWorkload`: reproduce the workbook's three `DESN X95/99` rows totaling `6` from exact codes and rates.
- `totalStudents`: sum populated `enrolled` or `students` fields.
- `sections`: count unaggregated course records rather than the workbook's aggregate display rows.
- `appliedLearning`: build configured course-code buckets from unaggregated records.
- `byQuarter`: build the full summary from exact course `quarter`, `credits`, and `workloadCredits`; only the `12`/`12`/`12` workload totals are present in the workbook.
- `currentWorkload`: write it from a reproduced `totalWorkloadCredits` value of `36`.
- `utilizationRate`: calculate the implied `100` after both `totalWorkloadCredits` and `maxWorkload` are present.
- `availableCapacity`: calculate the implied `0` after both `maxWorkload` and `totalWorkloadCredits` are present.
- `status`: let `recalcFacultyRecord()` derive the implied `optimal` value from `utilizationRate`.
- `specialRole`: resolve the calendar-key chair entries versus `getChairAssignment()`'s AY-start-year lookup; the latter makes Travis chair for Winter 2025-26 and drops DESN 495/499 from the calculator total even though `releaseTime` is `none`, but `recalcFacultyRecord()` re-adds finite course workload. The `travis-tenure` fallback supplies no `Chair` role; browser AY Setup may supply one, but repository files cannot establish that state.
- `baseYearData` / `getYearData`: load `js/year-filter.js` on `pages/faculty-workload-detail.html` so `buildIntegratedWorkloadYearData()` can obtain `workloadByYear.byYear["2025-26"]`; without that global function, the page substitutes empty base-year objects.
- AY Setup `name`: browser state is unknown; if absent, enter the identity in AY Setup, whose `saveStore()` writes `programCommandAySetup["2025-26"].faculty[]`.
- AY Setup `role`: browser state is unknown; if absent, enter it in AY Setup, otherwise `travis-tenure.role` falls back to `Full Professor`.
- AY Setup `annualTargetCredits`: browser state is unknown; if absent, enter it in AY Setup, otherwise `travis-tenure.annualTargetCredits` falls back to `36`.
- AY Setup `releaseCredits`: browser state is unknown; if absent, enter it in AY Setup, otherwise `travis-tenure.releaseCredits` falls back to `0`.
- AY Setup `releasePercent`: browser state is unknown; if absent, enter it in AY Setup, otherwise the fallback path calculates `0` from `0 / 36`.
- AY Setup `releaseReason`: browser state is unknown; if absent, enter it in AY Setup to explain release and participate in chair detection.
- AY Setup `notes`: browser state is unknown; if intended and absent, enter planning notes in AY Setup.
- AY Setup `active`: browser state is unknown; if absent, enter it in AY Setup to establish whether Travis is active.
- AY Setup `isChair`: browser state is unknown; if WorkloadIntegration should assign `specialRole: "Chair"`, enter it in AY Setup.
- `ayRole`: comes from browser AY Setup `role`; only when that entry is absent does a created integrated record receive fallback `Full Professor`.
- `ayTargetCredits`: comes from browser AY Setup `annualTargetCredits`; only when that entry is absent does a created integrated record receive fallback `36`.
- `ayReleaseCredits`: comes from browser AY Setup `releaseCredits`; only when that entry is absent does a created integrated record receive fallback `0`.
- `ayNetTargetCredits`: comes from browser AY Setup target and release values; only when that entry is absent does a created integrated record receive fallback `36`.
- `ayReleasePercent`: comes from browser AY Setup `releasePercent`; only when that entry is absent does a created integrated record receive fallback `0`.
- `ayReleaseReason`: supply browser AY Setup `releaseReason`; the `travis-tenure` fallback does not write this field.
- `ayNotes`: supply browser AY Setup `notes`; the `travis-tenure` fallback does not write this field.
- `ayActive`: supply browser AY Setup `active`; the `travis-tenure` fallback does not write this field.

### What it would take

- Fill the `Instructor` column for the 29 2025-26 records in
  `enrollment-data/processed/corrected-all-quarters.csv`, then run
  `package.json:calculate-workload` so `generateWorkloadReportByYear()` can emit
  `workloadByYear.byYear["2025-26"].all["Travis Masingale"]`; also reconcile the
  generator's `specialMultipliers` with `DEFAULT_APPLIED_LEARNING_COURSES` for
  `DESN 399` and `DESN 491` before treating workbook `K8` as reproduced.
- Make `js/year-filter.js:getYearData()` available to
  `pages/faculty-workload-detail.html` so the generated year object can become
  `baseYearData` in `buildIntegratedWorkloadYearData()` and reach
  `#facultySelect`.
- Preserve the workbook as the 36-credit reconciliation snapshot. Use AY Setup
  to write intended role/release fields to `programCommandAySetup`, and the
  detail page's `saveFacultyWorkloadDetailEntries()` path to write exact
  applied-learning records to `programCommandFacultyWorkloadDetails`.
