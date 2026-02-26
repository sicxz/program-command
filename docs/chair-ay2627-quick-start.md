# AY 2026-27 Scheduler + Preliminary Workload (Chair Quick Start)

## Short answer (for the chair)

Yes, you can use the scheduler to enter a draft AY 2026-27 schedule and use it to generate a preliminary workload view.

Current status:
- Good for draft planning and scenario testing.
- Workload dashboard support exists.
- Single-faculty workload spreadsheet export (`.xlsx`) is available from the workload dashboard.
- EagleNet comparison is planned later, once next year's EagleNet schedule is available.

## What this is good for right now

- Drafting the AY 2026-27 schedule
- Testing faculty/course assignment scenarios
- Viewing preliminary workload impact by faculty
- Exporting a draft workload sheet for one faculty at a time
- Meeting-time planning and "what if" conversations

## What to treat as preliminary (not final)

- Workload outputs that depend on manual overrides/release-time assumptions
- Non-teaching workload lines that need chair review (scholarship/service/PTOL/manual assigned time)
- EagleNet comparisons (next-year source data is not available yet)

## How to use it (simple workflow)

1. Start the app locally

Preferred (full features):

```bash
npm install
PORT=5174 HOST=127.0.0.1 npm run serve
```

Then open:
- `http://127.0.0.1:5174`

Fallback (static dashboards only):

```bash
python3 -m http.server 8080
```

Then open:
- `http://localhost:8080`

2. Open the scheduler

- Open the main scheduler page (`index.html`) for the normal draft schedule workflow.
- Optional: use `pages/schedule-builder.html` to load a previous year, analyze, and visually edit a draft schedule grid.

3. Select AY 2026-27

- Use the Academic Year selector.
- If available, use the "Copy Year" action to copy a prior year as a starting point.

4. Enter or edit the draft schedule

- Add/update courses, instructors, rooms, and time slots.
- Save your work periodically.
- If using the builder, use drag/drop + visual edits, then save/export the draft back into the main scheduler flow.

5. Generate/view preliminary workload

- Open the Workload Dashboard (`pages/workload-dashboard.html`)
- Select `2026-27`
- Review:
  - total workload by faculty
  - quarter distribution (preliminary)
  - applied learning contributions (if applicable)
  - TBD/unassigned sections (excluded from faculty totals)
- Use the `⬇️` button in a faculty row to export an **Export Workload Sheet (.xlsx)** draft.

## Recommended chair workflow (meeting-safe)

- Use the scheduler for draft planning decisions.
- Treat the workload numbers as preliminary planning estimates.
- Confirm release time / assigned time / manual workload lines before using exported sheets as final.
- Keep a dated version note (for example: "AY26-27 draft as of Feb 26 meeting").
- After the meeting, confirm release-time assumptions and any special assignments.

## Copy/paste response (send to chair)

Yes, you can enter the AY 2026-27 draft schedule in the scheduler and use it for planning. It is okay to work in it for preliminary scheduling and workload scenario testing. The workload dashboard is part of the tool, so once next year’s draft schedule is in there, we can generate a preliminary workload view and export a draft workload sheet.

Two caveats: (1) treat it as a planning draft, not the final official record yet, and (2) some non-teaching/release-time lines still require chair review/manual confirmation before finalizing the workload sheet. We can also add an EagleNet comparison later once next year’s EagleNet schedule is available.
