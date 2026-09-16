---
date: 2026-05-27
session: 2026-05-26 → 2026-05-27 (one continuous session, dates rolled mid-context)
status: ✅ shipped to prod; ⏳ one Supabase migration still pending
---

# Progress handoff — 2026-05-27

Single-day session that ran from triage of the live public schedule
through a multi-phase UI/UX audit and remediation of `schedule-builder`,
plus a quick layout reorder of `program-command`. Two PRs merged, both
live in prod. One Supabase migration is still pending. Eight follow-up
slices identified.

## Quick orientation for the next session

- Production URL: <https://sicxz.github.io/program-command/>
- Main HEAD: `c8751c4` (PR #260 merge)
- Local server: `python3 -m http.server 8080` (background task
  `bastnsxud` may still be running; restart if not)
- Last audit report: [`.context/compound-engineering/ce-review/schedule-builder-uiux-2026-05-26/findings.md`](/Users/tmasingale/Documents/GitHub/scheduler-v2-codex/.context/compound-engineering/ce-review/schedule-builder-uiux-2026-05-26/findings.md)
- Memory updated: [`phase1-and-public-landing-shipped.md`](/Users/tmasingale/.claude/projects/-Users-tmasingale-Documents-GitHub-scheduler-v2-codex/memory/phase1-and-public-landing-shipped.md)
  reflects the dropdown deploy + RPC migration applied state.

## What shipped today

### 1. PR #258 — Year dropdown (already in flight at session start)
- Tested locally, admin-merged (`gh pr merge 258 --merge --admin`),
  dispatched `ci.yml` on main, then `deploy-pages.yml`.
- Live at <https://sicxz.github.io/program-command/public-schedule.html>.
- Year list is now `['2026-27', '2025-26']` rendered as a `<select>` —
  no more 4-tab row with empty 2024-25 / 2023-24.

### 2. RPC migration applied to prod Supabase
- File: [`scripts/supabase-public-schedule-read.sql`](/Users/tmasingale/Documents/GitHub/scheduler-v2-codex/scripts/supabase-public-schedule-read.sql)
- Applied via Supabase SQL editor (project `ohnrhjxcjkrdtudpzjgn`) after
  diagnosing that the deployed RPC was the older commit `63fce2a`
  whose allowlist hard-coded `'2026-27'` and silently returned 0 rows
  for any other year.
- Post-migration RPC results: 2026-27 → 56 rows, **2025-26 → 57 rows**
  across Fall / Winter / Spring. Earlier years (2024-25, 2023-24) are
  legitimately empty in the DB.

### 3. PR #260 — Schedule builder UI/UX audit Phases A–E
Branch `feat/schedule-builder-data-safety` → merged 2026-05-26.
Five reviewable commits, one phase each:

| Commit | Phase | Resolves |
|---|---|---|
| `363cac8` | **A** — Data safety | P0 #2 dirty/beforeunload · #5 save-in-flight UI · #6 silent draft load fail |
| `c38f4cc` | **B** — Accessibility floor | P0 #3 modals → real dialogs · #4 live regions · P1 target sizes, focus mgmt, aria |
| `9238801` | **C** — Copy + reveal sequence | P1 stale copy ("Generate Schedule", "ChatGPT", "Make Workloads", "-- at --"); pre-data panels hidden until Load & Analyze |
| `fc22667` | **D** — Visual brand quick wins | P0 #13 wrong red (#b7142e → EWU #a10022) · #14 teal-on-red shadow · P1 focus rings, btn-small dedupe |
| `f06f3d5` | **E** — Drag-drop keyboard alternative | P0 #1 WCAG 2.1.1 + 2.5.7 pickup/Tab/drop with SR announcements |

### 4. PR #259 — Program command schedule-first layout
Branch `feat/program-command-layout` → merged 2026-05-26.

Pure CSS reorder via flex `order` on `.container`. DOM order
unchanged (preserves the 17k-line file's many `querySelector` /
`getElementById` calls). Visual order is now:

1. `app-header`
2. `quarter-nav` (welded to the grid below)
3. `.content` (the schedule view panel)
4. `.stats-bar`
5. `lens-filters`
6. `.dashboard-nav`

Both PRs admin-merged (1-approver ruleset on `main`; the user is the
sole repo owner). Standard deploy flow: dispatch `ci.yml` on main → wait
green → dispatch `deploy-pages.yml` → wait → verify. See [`deploy-after-merge-procedure.md`](/Users/tmasingale/.claude/projects/-Users-tmasingale-Documents-GitHub-scheduler-v2-codex/memory/deploy-after-merge-procedure.md).

## Still pending

### Supabase migration not yet applied
- File: [`scripts/supabase-current-term-setting.sql`](/Users/tmasingale/Documents/GitHub/scheduler-v2-codex/scripts/supabase-current-term-setting.sql)
- Effect: creates `public.public_schedule_settings` table +
  `get_public_current_term` (anon-readable) + `set_public_current_term`
  (authenticated). Lets the admin set which AY + quarter the public
  page defaults to.
- Until applied, the anon RPC returns `PGRST202: function not found`
  and the public page silently falls back to **Fall 2026-27** via the
  resilient code path in `pages/public-schedule.js`.
- To apply: open <https://supabase.com/dashboard/project/ohnrhjxcjkrdtudpzjgn/sql/new>,
  paste the file contents, run. Single idempotent block. Confirmed
  safe in the test suite (`tests/supabase-current-term-setting.test.js`).

### Branches not deleted on merge
Following the prior convention from PRs #256/#257, both new merged
branches still exist on origin:
- `feat/schedule-builder-data-safety`
- `feat/program-command-layout`

Plus the older `feat/public-year-dropdown` from earlier in the day.
Run `git push origin :<branch>` (or the existing
[`compound-engineering:git-clean-gone-branches`](https://github.com/sicxz/program-command/) skill)
when you want them gone.

## Audit findings still open

Of the 28 deduped findings in the audit report, **20 were resolved**
across Phases A–E. The remaining 8 are all design-system token
consolidation work, deliberately deferred as out-of-scope for "audit
fixes":

- **P1 #25** — Cards / buttons / typography / spacing / status colors
  all improvised per component. Needs a real token system in
  `css/design-system.css` that `schedule-builder.css` and friends
  consume.
- **P1 #22** — Color-only priority signals (`.course-block.priority-*`
  and `.faculty-load.overload`). Needs a text/icon companion for
  color-vision-deficient users.
- **P1 #28** — Two stylesheets fight for `.builder-header`
  (`schedule-builder.css` vs `program-command-dashboard-theme.css`
  with `!important`). Phase D defused the teal-vs-red conflict but
  the duelling-stylesheet situation remains.
- **P2 #27** — No motion system, no spacing scale, 15 inline `style=""`
  attributes still in `pages/schedule-builder.html`.
- Plus four lower-severity P1/P2 polish items.

These belong in a "design system consolidation" ticket, not a fix pass.

## Loose UI/UX threads from the live session

User flagged, not yet addressed:

- **`app-header` is still ~200px tall** on `program-command.html`.
  Could compact to one line; settings gear could move into the header
  strip instead of floating as a card.
- **Stats bar shows `0 / 0 / 19 / 83%` before data exists** — same
  trick we used in Phase C (hide until populated) should apply here too.
- The schedule-first layout reorder is **CSS-only via flex `order`**.
  At some point this should be refactored to actual DOM order for
  maintainability, but doing so requires touching the 17k-line file
  more invasively — defer until other work touches that area.

## Key file pointers for the next session

| File | What it is |
|---|---|
| `pages/schedule-builder.html` | The big chair editor — heavily touched in Phases B/C/E |
| `pages/schedule-builder.js` (~4,200 lines now) | Page controller. New helpers grouped under PHASE A/B/E comment banners near the top of the helper section (around line 3290 onward). |
| `css/schedule-builder.css` (~2,700 lines now) | Page styles. New blocks under PHASE A/B/C/E comment banners near the bottom. |
| `js/auth-guard.js` | Owns multi-editor conflict + view-only mode. Phase B added `role="alert"` / `role="status"` and bumped `.edit-lock-btn` to 28×28. |
| `program-command.html` | The 17k-line app shell. Only change today: `.container--schedule-first` flex-order block at ~line 4423. |
| `scripts/supabase-public-schedule-read.sql` | Applied to prod today. |
| `scripts/supabase-current-term-setting.sql` | **Still pending — apply when convenient.** |
| `.context/compound-engineering/ce-review/schedule-builder-uiux-2026-05-26/findings.md` | Full audit report (28 findings, P0–P2 grouped). |
| `docs/progress-handoff-2026-05-27.md` | This file. |

## Local environment state at end of session

- Working tree on `feat/program-command-layout` (already merged; safe to
  switch off).
- `M CLAUDE.md` and a large list of untracked files (`.codex/`,
  `.cursor/`, `.playwright-mcp/`, `TRAVIS.md`, several `docs/plans/*`
  files, and ~15 untracked aspirational test files in `tests/`) — all
  pre-existing the session. Not touched.
- Background bash task `bastnsxud` was running `python3 -m http.server
  8080` for local verification. May have exited if the session has
  been idle; restart with `python3 -m http.server 8080` from the repo
  root if needed.

## Suggested next slice

Decreasing order of leverage:

1. **Apply `supabase-current-term-setting.sql`** to prod Supabase so
   the admin's default-term picker actually takes effect. ~5 minutes,
   already tested.
2. **Compact the `<app-header>` on `program-command.html`** and tuck
   the Settings card into the header strip. Visible win at every page
   load.
3. **Hide the stats bar until data exists** (`Critical / Conflicts /
   Courses / Utilization`). Same pattern as Phase C panel-reveal.
4. **Design system token consolidation** (the big P1 backlog above) —
   needs a separate planning pass; budget for half a day minimum.

Pick one, start it, ship it.
