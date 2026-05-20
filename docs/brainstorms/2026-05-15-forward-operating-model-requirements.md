---
date: 2026-05-15
topic: forward-operating-model
---

# Forward Operating Model: Trunk-Based Delivery + Reorientation Layer

## Problem Frame

`program-command` (heading toward "college command" — institution-wide scheduling) is maintained by **one person who works intermittently**, supervised on top of **autonomous AI agents** (Claude Code / Codex) that generate branches and PRs continuously. The current gitflow model (`main` = prod, `develop` = integration) produced exactly the predictable failure: `develop` drifted ~2 months / ~40 commits from `main`, PRs rotted into conflicts, and the maintainer cannot tell what is solved vs. old when returning. The previously assumed safety of a separate `develop` branch is **false** — production data is actually isolated by an environment/deploy boundary (two Supabase projects + host routing + read-only public surface), not by the branch.

This effort changes the operating model so that (a) work stops rotting, (b) production data cannot be polluted, and (c) the maintainer can reorient cold in minutes and never loses the "why" behind decisions.

### Target Operating Model

```
  autopilot agents ─┐
                     ├─▶ short-lived branch ─▶ PR ─▶ [CI merge wall: must be green]
  you ──────────────┘                                        │
                                                              ▼
                                                    main (always shippable,
                                                     = the project's memory)
                                                              │
                                  ┌───────────────────────────┘
                                  │  (autopilot is RULE-BARRED here —
                                  │   enforced, not assumed: see R6/R16)
                                  ▼
                      YOU click "Deploy to Production"
                      (manual workflow_dispatch, CI-green required)
                                  │
                                  ▼
                      GitHub Pages (only deploy) ─▶ PRODUCTION Supabase
```

## Requirements

**Trunk Migration & develop Retirement**
- R1. Adopt trunk-based development: `main` is the single long-lived branch and is always shippable. All work (human or agent) happens on short-lived branches merged back via PR.
- R2. Rescue `develop`'s unique forward work — **~9 non-merge commits** on the `develop` branch itself (multi-program department shell, screenshot/onboarding intake, profile-aware surfaces); the count is approximate and merge commits are excluded — onto `main` via one or more reviewed PRs, resolving conflicts against `main`'s ~31 forward commits (public schedule + Foundry + hotfixes). The exact rescue mechanism (cherry-pick vs. rebase vs. squash-merge, and conflict order) is a deferred technical question.
- R3. After its unique work is preserved on `main`, delete the `develop` branch (local + remote) and remove `develop` from all CI/workflow triggers.
- R4. Resolve the **9 open strategic PRs** — a *separate* set from R2's commits: these are independent `codex/issue-*` branches (#203, #204, #216, #219, #225, #227, #229, #235, #246), not `develop` itself. Retarget each from `develop` to `main`, rebase, and either merge or close with a recorded reason — none left to rot. (The "9" in R2 and R4 is coincidental, not a 1:1 mapping.)

**Production Data Safety / Deploy Gate**
- R5. Enable branch protection on `main`: the CI `test` and `onboarding` checks are **required** status checks; a PR that is not green cannot merge.
- R6. Remove auto-deploy-on-push. Production publishing happens **only** via a manual "Deploy to Production" action (`workflow_dispatch`) that requires CI green. "Autopilot cannot publish prod" must be **enforced, not assumed**: agents are rule-barred (R16) from editing `.github/workflows/`, CI config, deploy automation, or `js/supabase-config.js`; enforcement mechanism (CODEOWNERS / required human approval on those paths / a CI check rejecting such edits on agent branches / GitHub Environments approval gate) is a deferred technical question, but the *requirement* that the barrier be enforced is firm.
- R7. Production remains one URL backed by the production Supabase project; the public surface stays read-only (already true) as defense in depth.
- R8. Ship RLS hardening (PR #246) **first, as a hard prerequisite** — it must be merged to `main` and verified enforced in the production Supabase project **before** `develop` is deleted (R3) and before the trunk cutover (R1) completes. Rationale: the production Supabase anon key is public by design, so RLS is the *only* thing protecting production data; the window between "trunk-based / `develop` deleted" and "RLS live" is the single most dangerous state and must not exist.
- R9. Remove the dead Replit deploy *references* so the documented prod path matches reality (GitHub Pages, static): the `.replit` file and the Replit deploy section of `CLAUDE.md`. **This requirement does not by itself decide the fate of `api-server.js` / `google-sheets-client.js` / the `/api/export-to-sheets` endpoint** — that is an open user decision (see Deferred Questions). R9 only removes the Replit-specific references; whether the Node API surface is kept (and rehosted) or deleted is resolved separately.

**Strategic PR Sequencing (toward college-command)**
- R10. Sequence the kept PRs by strategic theme after the data-safety keystone (#246): scheduler data contract/correctness (#203, #235), multi-program/EECS core (#216, #227, #229), onboarding/OCR intake (#219, #225), tooling (#204).
- R11. Conflicting PRs (#227, #229) are rebased onto `main` only after R2's forward work lands, so they conflict against a single trunk, not a moving `develop`.

**Reorientation & Self-Education Layer**
- R12. Maintain a single living **compass** doc (`ORIENT`): what this project is, what is in production, current focus, the explicit next action, and where to look. Readable in under ~5 minutes cold. Carries a visible **"last updated / prod-state-as-of"** stamp and a defined **refresh trigger** (refreshed as part of every "Deploy to Production" action, so it never lags prod) to prevent the docs from rotting the way `develop` did.
- R13. Maintain a **decision log**: every non-obvious decision recorded in ~3 lines — what was chosen, why, what was rejected. Seeded from the Key Decisions below. Appended at decision time (not batched), so the "why" is never reconstructed from memory.
- R14. Maintain an **ONBOARDING** doc (architecture, data model, workflows) refreshed via the `/onboarding` skill on a defined cadence (and discoverable: linked from `README` / `CLAUDE.md` as the cold-start entry point alongside `ORIENT`).
- R15. All three reorientation docs, and any future doc the maintainer is meant to read, are authored as **HTML styled with a "docs" variant of the product design system** (EWU brand, Foundry shell) — not raw markdown. This is a **deliberate standing user requirement** (matches the no-build vanilla HTML/JS product, opens in-browser, reinforces the design system), explicitly *not* gold-plating to be trimmed.

**Branch / PR Discipline (keeps sprawl from recurring)**
- R16. Branches are short-lived; merged branches auto-delete; no branch persists without action beyond a defined age (default proposal: act on or close branches older than ~7 days). `AGENTS.md` autopilot rules updated so agents target `main`, keep branches short, **never deploy prod, and never modify a defined forbidden-path set** (`.github/workflows/`, CI config, `js/supabase-config.js`, `.env*`, Supabase SQL/policy files). The forbidden-path rule is the policy half of R6's enforced barrier.

## Success Criteria
- **RLS (#246) is merged and verified enforced in the production Supabase project before `develop` is deleted** — there is never a moment where the repo is trunk-based with `develop` gone but RLS not yet live.
- Zero long-lived branches; `develop` deleted with its unique work preserved on `main`.
- `main` CI is a required merge check; broken code cannot land.
- Production publishes only by a deliberate human action; the autopilot barrier is *enforced* (an agent that attempts to edit a forbidden path or auto-deploy is blocked or flagged, not merely discouraged).
- The documented production path matches the actual one (no Replit references).
- Returning cold, the maintainer reorients from one HTML compass page in minutes; the compass is no staler than the last prod deploy; any past decision's "why" is recoverable from the decision log.
- All 9 open strategic PRs are resolved (merged or closed with reason); none rotting.

## Scope Boundaries
- Not changing application product features here — this is operating model, infra, and docs only.
- Not building a separate staging/preview environment — explicitly rejected in favor of one URL + manual prod button.
- Not introducing build tooling — the no-build vanilla HTML/JS constraint stays.
- Not redesigning Supabase schema or data — RLS hardening rides on existing PR #246, not reworked here.

## Execution Sequence (resolved)

- **Phase 0 — Stop the bleeding (immediate, hours):** Merge RLS #246 *and* remove the auto-deploy-on-push trigger so production publishes only via the manual button. This defuses the danger that exists *today* (main auto-deploys to prod + soft RLS) and removes all data-safety time pressure from every later phase. Hard prerequisite for R1/R3.
- **Phase 1 — Operating model + full reorientation layer up front:** Trunk cutover (R1, R3, R5, R6, R7, R9, R16) and the complete reorientation layer (R12–R15: ORIENT + decision log + ONBOARDING, HTML in the docs design-system variant) built as a deliberate phase *before* product unblock. The decision log begins immediately (this brainstorm is its first entries). User-chosen over "product first" — a fully oriented project is the priority.
- **Phase 2 — Product unblock:** Rescue `develop`'s forward work (R2), resolve/retarget the 9 strategic PRs and the conflicting #227/#229 (R4, R10, R11) toward college-command, on the now-stable trunk.

## Key Decisions
- **Trunk-based over gitflow**: long-lived branch divergence outlives an intermittent solo maintainer's memory; with trunk-based, repo state *is* the memory. Precise framing (per review): `develop` *accidentally* provided deploy isolation (Pages only auto-deploys from `main`), but its real cost was unmaintainable rot/conflicts. Trunk-based replaces that accidental isolation with a deliberate, *stronger* control (manual deploy + enforced autopilot barrier + RLS) — but only if RLS lands first (see R8).
- **Data safety = deploy/environment boundary, not branch**: verified two Supabase projects + host-based routing + read-only public surface; the branch added reconciliation tax without real data protection. The production Supabase **anon key is public by design** (committed in `js/supabase-config.js`, required for a browser app), so RLS is the *sole* data-safety mechanism — not key secrecy, not the branch.
- **Manual "Deploy to Production" button**: simplest model with the strongest guarantee — autopilot cannot publish prod; nothing reaches prod data unless the maintainer presses it.
- **Retire Replit / api-server path**: dead since ~January; GitHub Pages (static) is the real production.
- **RLS (#246) first**: it is the keystone of defense-in-depth, not just another feature PR.
- **Docs as HTML in product design system**: matches the no-build product, opens in browser, improves cold reorientation.
- **Reorientation layer is the spine**: it is what makes solo-intermittent + autopilot sustainable, not an optional nicety.

## Dependencies / Assumptions
- Assumed: GitHub Pages is the live production URL real users open (no other prod surface observed). Verify in planning.
- Branch protection with required status checks (R5): **verified feasible** — `sicxz/program-command` is a **public** repo, so required checks/branch protection are available at no cost. No protection is currently configured (to be added by R5). No fallback needed.
- The production Supabase anon key is public by design (browser app); the `develop` project's anon key is currently blank. Neither is a data-safety control — RLS is. Not needed under the chosen manual-prod model.

## Outstanding Questions

### Resolve Before Planning
- (none — sequencing resolved; see Execution Sequence)

### Deferred to Planning
- [Affects R9][User decision] Is the Google Sheets export / `api-server.js` / `/api/export-to-sheets` still wanted at all (and rehosted off Replit), or cut as dead weight?
- [Affects R2,R4,R11][Technical] Exact rescue mechanism and conflict-resolution order for `develop`'s forward commits relative to rebasing #227/#229.
- [Affects R6,R16][Technical] Concrete enforcement of the autopilot barrier (CODEOWNERS, required approval on forbidden paths, CI rejection of workflow edits on agent branches, or GitHub Environments approval gate).
- [Affects R16][Technical] Mechanism for enforcing branch-age/auto-cleanup (workflow, scheduled job, or convention) and the exact age threshold.
- [Affects R14,R15][Technical] Whether `ONBOARDING` is generated via `/onboarding` or hand-authored, and the HTML docs-design-system variant's structure.
- [Affects R7][Technical/Needs research] Defense-in-depth for the `develop` Supabase project itself (restrictive defaults so a bad agent write to dev data has minimal blast radius) — bounded by the "no schema redesign" scope boundary.

## Next Steps
→ `/ce:plan` for structured implementation planning (sequencing resolved; no blocking questions remain).
