# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Two-Model Stack — Division of Labor

This project uses a two-model coding stack:

- **Claude Code (you)** — architecture, design decisions, codebase reading, API surface design, naming, complex reasoning, visual polish, and anything where judgment > throughput.
- **Codex / GPT-5.5** — implementation sprints, multi-file refactors, test generation, debugging passes, and long parallel jobs.

**When Claude Code should hand off to Codex:**
- Writing boilerplate CRUD endpoints
- Scaffolding test files
- Mechanical refactors across many files
- Long running tasks that can run in parallel while Claude designs the next slice

**Token discipline:** Do not re-derive project conventions each session. They are captured here and in the orientation docs. Read once, act.

## Cold start

Returning cold, or arriving for the first time? Read the reorientation docs in order before touching anything:

1. [`docs/ORIENT.html`](docs/ORIENT.html) — what is in production right now and the single next action.
2. [`docs/decision-log.html`](docs/decision-log.html) — why current choices were made.
3. [`docs/ONBOARDING.html`](docs/ONBOARDING.html) — architecture, data model, two-Supabase routing, deploy flow, branch protection, and autopilot forbidden paths.

## Project Overview

EWU Design Schedule Analyzer — an analytics platform for enrollment trends, faculty workload, and capacity planning for the EWU Design program. Vanilla JavaScript frontend with a Node.js backend, Supabase (PostgreSQL) for persistence, and Chart.js for data visualization. No build tooling or bundler — HTML files load JS modules directly via `<script>` tags.

## Development Commands

```bash
# Serve locally (no build step needed)
python3 -m http.server 8080          # or: npm run serve
node api-server.js                    # production server on port 5000

# Tests (Jest with jsdom)
npm test                              # run full suite
npm run test:watch                    # watch mode
npm run test:coverage                 # coverage report

# Data processing pipeline
npm run validate-data                 # validate enrollment CSV
npm run process-data                  # regenerate enrollment-dashboard-data.json & workload-data.json
npm run calculate-workload            # calculate faculty workload from processed data
```

Tests live in `tests/` and match `**/*.test.js`. Coverage collects from `js/**/*.js` excluding `js/config/`.

## Architecture

### Module Pattern
All shared modules in `js/` use the **IIFE (Immediately Invoked Function Expression) singleton pattern**:
```javascript
const ModuleName = (function() {
    'use strict';
    let privateState = {};
    return { init() {}, get() {}, set() {} };
})();
```
Do not convert these to ES module `import/export` — the frontend loads them as global `<script>` tags. The `package.json` has `"type": "module"` for Node.js scripts only.

### Key Layers
- **Page Controllers** (`pages/*.js`) — Each dashboard HTML has a paired JS file that orchestrates UI, initializes modules, and handles page-specific logic.
- **Managers/Services** (`js/`) — Domain-specific singletons: `ScheduleManager`, `FacultyManager`, `ReleaseTimeManager`, `BackupManager`, `StateManager`.
- **StateManager** (`js/state-manager.js`) — Central state store with subscription-based reactivity and localStorage persistence. Components subscribe to state changes.
- **db-service.js** — Supabase data access layer with automatic fallback to local JSON files when Supabase is unavailable.
- **Engines** — `ConflictEngine`, `ConstraintsEngine` for schedule validation and constraint enforcement.
- **Data Processing Scripts** (`scripts/`) — Node.js CLI tools for CSV validation, enrollment processing, and workload calculation.

### Data Persistence
1. **Supabase** — Primary persistence for courses, faculty, constraints, release time allocations
2. **localStorage** — Client-side persistence for schedule edits, placements, backup snapshots (prefix: `ewu_schedule_`)
3. **Static JSON** — Fallback data files (`workload-data.json`, `enrollment-dashboard-data.json`, `data/*.json`)

### API Server
`api-server.js` — Node.js HTTP server (port 5000) serving static files and one API endpoint: `POST /api/export-to-sheets` for Google Sheets export via `google-sheets-client.js`.

## Key Directories

- `js/` — Shared business logic modules (26 files): state management, data loading, validation, chart utilities, scheduling engines
- `js/config/constants.js` — Centralized constants (workload multipliers, faculty limits, thresholds, colors). Frozen at runtime.
- `pages/` — Dashboard HTML/JS pairs (schedule builder, workload, capacity, constraints, release time, applied learning, etc.)
- `scripts/` — Data processing CLI tools and SQL schema files
- `data/` — Static JSON data (course catalog, prerequisite graph, room constraints, scheduling rules)
- `css/` — `design-system.css` (EWU brand: `#a10022`), `shared.css`, plus dashboard-specific styles
- `enrollment-data/processed/` — Source enrollment CSV data

## Domain Conventions

### Workload Calculations
- Regular courses: credits × 1.0
- DESN 495 (Internship): credits × 0.1
- DESN 499 (Independent Study): credits × 0.2
- DESN 491 (Practicum): credits × 0.15

### Faculty Rank Limits (annual credits)
- Professors (Full/Associate/Assistant): 36
- Lecturers (Senior/Regular): 45
- Adjunct: 15

### Utilization Thresholds
- Overloaded: >100%
- Optimal: 60–100%
- Underutilized: <60%

### Data Formats
- Course codes: `DESN XXX` (e.g., DESN 499)
- Academic years: `YYYY-YY` (e.g., 2024-25)
- Quarters: Fall, Winter, Spring, Summer
- Faculty configuration: `scripts/faculty-mapping.json`

## Deployment

Production is **static GitHub Pages** — published only by a manual `workflow_dispatch` run of `.github/workflows/deploy-pages.yml`, which refuses to publish unless the deployed commit's `test` and `onboarding` checks are both green. There is no Node server in production. See `docs/ONBOARDING.html` for the full deploy flow.

`api-server.js` is a **local/dev-only** Node server (port 5000) that serves static files and the `POST /api/export-to-sheets` endpoint (Google Sheets export, used for faculty workloads). It does **not** run on GitHub Pages, so the Sheets export only works when running locally via `npm run serve`. Rehosting the export so it works against the static prod surface is tracked as a follow-up.
