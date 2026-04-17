# Dashboard Shell Baseline

This document defines the baseline shell that release-gated dashboard and planning surfaces should converge toward during production-readiness remediation.

## Baseline Candidate

The strongest current candidate is the newer shell direction already visible in:

- `pages/eaglenet-compare.html`
- `pages/schedule-builder.html`
- `js/components/app-header.js`
- `css/program-command-dashboard-theme.css`

## Baseline Expectations

### Header and Top-Level Framing

- Use a shared header model, preferably `app-header` or a compatible shell component with equivalent hierarchy and action behavior.
- Do not introduce page-specific hero treatments that make a dashboard feel like a separate product.
- Preserve room for program or department branding through tokens rather than bespoke page chrome.

### Primary Content Shell

- Use panelized sections or clearly bounded content blocks.
- Keep page width, spacing rhythm, and section separation predictable across dashboards.
- Use summary cards for top-line metrics only when they are meaningful and consistent with nearby surfaces.

### Navigation and Action Hierarchy

- Every release-gated dashboard should have a clear path back to the surrounding planning workflow.
- Neighboring-tool navigation should be deliberate and not rely on ad hoc button collections.
- Primary, secondary, and destructive actions should be visually distinct and consistent with the shared shell.

### Status and Disclosure

- Use explicit status rows, banners, or pill language that maps to a stable severity model.
- Use `details/summary` for dense supporting assumptions or diagnostics instead of long always-open blocks.
- Empty states must explain what is missing, what it means, and what the user should do next.

## What This Baseline Does Not Require

- It does not require every page to have identical density.
- It does not require every tool to use the exact same card layout.
- It does not require a full visual redesign before consistency work can start.

## Broader Refresh Trigger

A broader shell refresh should be recommended only if one or more of these become true:

1. Most release-gated surfaces cannot adopt the current shared header and theme direction without preserving major page-local framing.
2. The current shared shell cannot express the dashboard/action/status patterns the release-gated surfaces actually need.
3. Standardizing around the current shell would still leave obvious product fragmentation to users.

If those conditions are not met, the preferred path is convergence, not redesign.
