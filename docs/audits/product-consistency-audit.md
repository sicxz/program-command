# Product Consistency Audit

This audit evaluates whether the production-facing scheduler and dashboard surfaces behave like one coherent product.

## Consistency Rubric

Each audited surface is reviewed against the same baseline questions:

| Dimension | What good looks like |
| --- | --- |
| Shell structure | Shared header model, predictable page framing, and a consistent primary content shell |
| Navigation | Clear route-back story, neighboring-tool navigation, and no isolated dead-end dashboards |
| Typography and layout | Shared hierarchy, spacing rhythm, and summary-card usage that feels related across pages |
| Status and empty states | Consistent severity language, banners/status rows, and useful empty states |
| Action hierarchy | Primary, secondary, and destructive actions are visually distinct and stable across surfaces |
| Disclosure patterns | Dense supporting detail is collapsed or grouped consistently rather than dumped inline |

## Surface Assessment

| Surface | Current state | Notable evidence |
| --- | --- | --- |
| Main scheduler (`index.html`) | Mixed | Unique product shell and interactions, but not yet clearly shared by dashboard pages |
| Schedule builder (`pages/schedule-builder.html`) | Near-baseline candidate | Uses `program-command-dashboard-theme.css`, summary cards, and structured analysis panel, but still has page-local shell decisions |
| Workload dashboard (`pages/workload-dashboard.html`, `pages/workload-dashboard.js`) | Transitional | Strong disclosure and planning-state language in JS, but page shell still relies on older `dashboard.css`, large inline styles, and page-specific chrome |
| Release-time dashboard (`pages/release-time-dashboard.html`, `pages/release-time-dashboard.js`) | Transitional | Similar card structure to workload, but still hand-rolls a header shell and large inline style block |
| Recommendations dashboard (`pages/recommendations-dashboard.html`) | Legacy bespoke | Standalone gradient visual system, custom header/nav/buttons, and no shared product shell |
| EagleNet compare (`pages/eaglenet-compare.html`, `pages/eaglenet-compare.js`) | Strong modern reference | Uses `app-header`, panel shell, summary grid, clear status states, and `details/summary` disclosure patterns |
| Department onboarding (`pages/department-onboarding.js`) | Runtime-aware but shell-unclear | Onboarding status and handoff messaging are evolving, but this flow still needs to be measured against the shared shell baseline |

## Recurring Findings

| ID | Type | Surface | Impact | Recommended outcome | Blocks multi-department |
| --- | --- | --- | --- | --- | --- |
| PCI-001 | `consistency-issue` | Dashboard pages as a group | Production dashboards do not share one obvious shell pattern; some use `app-header`, others hand-roll `<header>` and custom nav controls | Define one dashboard shell baseline and migrate release-gated surfaces toward it | yes |
| PCI-002 | `consistency-issue` | Legacy bespoke dashboards | Recommendations and similar pages use bespoke gradients, button treatments, and page framing that make them feel like separate tools | Either normalize these pages to the baseline or remove them from the release gate until they are aligned | yes |
| PCI-003 | `consistency-issue` | Workload and release-time dashboards | Shared operational concepts exist, but styling, layout, and header/navigation patterns are duplicated in page-local ways | Consolidate them around a common shell, summary-card, and status-language pattern | yes |
| PCI-004 | `docs-process-gap` | Product-wide | The current UI guidance references Primer principles but does not yet define the release-gated baseline shell or the criteria for when a broader refresh is required | Extend the UI guidance so later remediation work is aiming at an explicit baseline | yes |

## Audit Conclusion

The current codebase has enough evidence of a stronger direction to define a baseline now. The emerging pattern is:

- `app-header` or equivalent shared header behavior
- `program-command-dashboard-theme.css` or a successor shared theme layer
- panelized content sections
- summary-card grids for at-a-glance metrics
- explicit status and empty-state language
- `details/summary` for dense supporting detail

What is missing is not taste. It is convergence.

## Decision Criteria: Standardize Or Refresh

The product-consistency pillar should use this decision rule:

- **Standardize around the current shell direction** if the release-gated surfaces can adopt the shared header, theme, and panel/status model without rewriting their core workflows.
- **Recommend a broader shell refresh** only if the audit shows that the current scheduler/dashboard shell cannot absorb most release-gated surfaces without preserving major inconsistency or duplicated page-local framing.

## Proof Required To Pass

- Every release-gated surface is assessed against the shared rubric
- A documented shell baseline exists
- Each release-gated surface is either:
  - aligned to the baseline,
  - intentionally excluded from the gate, or
  - explicitly blocked as remediation work
- UI guidance names the shared shell expectations and status/empty-state conventions

## References

- `docs/ui/primer-product-ui-guidelines.md`
- `docs/audits/dashboard-shell-baseline.md`
- `pages/eaglenet-compare.html`
- `pages/schedule-builder.html`
- `pages/workload-dashboard.html`
- `pages/release-time-dashboard.html`
- `pages/recommendations-dashboard.html`
