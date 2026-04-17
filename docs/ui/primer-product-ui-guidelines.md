# Primer Product UI Guidelines (Workload / Scheduler Surfaces)

## Reference
- Primer Product UI: [https://primer.style/product/](https://primer.style/product/)

This repo uses Primer Product UI as the design-system reference for chair-facing planning surfaces, especially workload and scheduler-adjacent dashboards.

For the production-readiness program, Primer remains the design reference, but the operational baseline for release-gated surfaces is defined in:

- `docs/audits/product-consistency-audit.md`
- `docs/audits/dashboard-shell-baseline.md`

## What We Apply Here

### Foundations
- Typography: clear hierarchy (headline, supporting text, metadata labels, table headers)
- Color: neutral base UI with reserved status colors for warnings, errors, and success states
- Layout: predictable spacing rhythm, grouped controls, and readable content width
- Responsive: controls wrap cleanly and key actions remain accessible on smaller widths
- Content: concise labels, scannable summaries, and explicit caveats for preliminary data

### UI Patterns
- Notification messaging: inline banners/status rows for warnings and refresh results
- Progressive disclosure: use `details/summary` for dense assumptions and preview lists
- Data tables: emphasize scannability (header contrast, compact rows, status labels)
- Empty states: explain what data is missing and what action to take next
- Action hierarchy: clear primary action, secondary actions, and destructive/warn actions

## Local Adaptations (Project Constraints)
- This app is plain HTML/CSS/JS, so Primer is used as a visual/pattern reference, not as a component library dependency.
- We favor lightweight, page-local CSS for high-change prototypes, but naming should stay reusable and readable.
- Existing dashboards already contain mixed UI styles; incremental normalization is acceptable as long as the edited surface becomes more consistent.
- Chair workflow screens must preserve dense operational data while improving scan speed and reducing ambiguity.

## Workload Dashboard Checklist

Use this checklist when editing `pages/workload-dashboard.*`:

- Headline + support text establish whether data is draft/preliminary/final
- Summary stats use a consistent label/value pattern
- Warnings/assumptions are visually distinct from neutral info
- Dense lists are collapsed by default when appropriate
- Primary vs secondary vs destructive actions are visually distinct
- Empty states say what happened, what it means, and what to do next
- Table labels and badges are legible at a glance
- Mobile width behavior is acceptable (wrapped controls, no hidden critical actions)

## Release-Gated Shell Expectations

Use these as the shared dashboard-shell baseline while the readiness program is active:

- Prefer the shared header direction (`app-header` or equivalent shared shell behavior) over page-specific hero headers
- Prefer the shared dashboard theme layer over bespoke gradient page framing
- Use stable status and empty-state language across release-gated surfaces
- Use `details/summary` for dense supporting assumptions or diagnostics when the content would otherwise overwhelm the page
- Treat a broader visual refresh as an audit outcome, not a starting assumption

## Status Color Intent (Recommended)
- Neutral: informational framing, table chrome, secondary actions
- Blue: primary actions and informational refresh/update messages
- Yellow/Amber: provisional data, warnings, needs review
- Green: success/confirmed states
- Red: destructive actions or error/overload states only

## When to Open a New UI Issue
- The change introduces a new dashboard pattern (new report/table/filter workflow)
- The page needs a reusable style token set used by multiple dashboards
- The data semantics change (not just visuals), especially utilization/adjunct reporting
