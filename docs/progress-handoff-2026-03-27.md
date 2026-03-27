# Codex Handoff: 2026-03-27

## Repo / Branch Context

- Main local repo at `/Users/tmasingale/Documents/GitHub/scheduler-v2-codex` is **dirty** on `codex/issue-199-recovery`.
- Current clean worktree for this slice is `/Users/tmasingale/Documents/GitHub/scheduler-v2-codex-224`.
- Active branch in that worktree: `codex/issue-224`
- Branch status: clean and pushed
- Current branch head after this handoff doc: `6fa94dd Add 2026-03-27 progress handoff`
- Latest functional bakeoff commit before this doc: `962a77f feat: add EagleNET vision bakeoff endpoint`

## Relevant GitHub Items

- Issue [#223](https://github.com/sicxz/program-command/issues/223): `EagleNET screenshot import: capture classroom and enrollment data beyond CLSS`
- Issue [#224](https://github.com/sicxz/program-command/issues/224): `Vision bakeoff: compare Gemini and GPT on EagleNET screenshot extraction`
- PR [#219](https://github.com/sicxz/program-command/pull/219): `Implement screenshot OCR onboarding import`
  - Status: open
  - Branch: `codex/issue-217-screenshot-import`
  - Important: this branch contains the current screenshot onboarding UI flow, but that flow still assumes a CLSS-like review path and is not the final EagleNET model.
- PR [#225](https://github.com/sicxz/program-command/pull/225): `[#224] Add EagleNET vision bakeoff endpoint`
  - Status: open, draft
  - Base: `develop`
  - Branch: `codex/issue-224`

## What Was Implemented on #224

Files:

- [api-server.js](/Users/tmasingale/Documents/GitHub/scheduler-v2-codex-224/api-server.js)
- [server/eaglenet-vision-bakeoff.cjs](/Users/tmasingale/Documents/GitHub/scheduler-v2-codex-224/server/eaglenet-vision-bakeoff.cjs)
- [scripts/run-eaglenet-vision-bakeoff.js](/Users/tmasingale/Documents/GitHub/scheduler-v2-codex-224/scripts/run-eaglenet-vision-bakeoff.js)
- [tests/eaglenet-vision-bakeoff.test.js](/Users/tmasingale/Documents/GitHub/scheduler-v2-codex-224/tests/eaglenet-vision-bakeoff.test.js)

Implemented behavior:

- Added a read-only `POST /api/vision/eaglenet-bakeoff` endpoint.
- Added one shared EagleNET screenshot extraction schema for OpenAI and Gemini.
- Added provider-specific request builders for:
  - OpenAI Responses API
  - Gemini 2.5 Pro
- Added a local CLI runner:
  - `npm run bakeoff:eaglenet -- "<folder>" --out /tmp/output.json`
- Increased Express JSON body limit to support inline image uploads for bakeoff requests.
- Added Jest coverage for:
  - request normalization
  - credential resolution
  - OpenAI payload shaping
  - handler validation behavior
  - mocked provider comparison

## Validation Completed

- `npm test -- --runInBand`
  - Passed in the `codex/issue-224` worktree
- Local route validation on `http://127.0.0.1:8123/api/vision/eaglenet-bakeoff`
  - missing-key validation
  - upstream failure handling with a dummy key
- Local `.env.local` was copied into the issue worktree so the Node server could see `OPENAI_API_KEY` and `GEMINI_API_KEY`
  - note: `.env.local` is local-only and not committed

## Bakeoff Findings

### Fall single-screenshot sample

Input folder:

- `/tmp/eaglenet-fall-sample`
  - copied from `/Users/tmasingale/Downloads/cscd-cyber AY2025-26/cscd fall 2025/cscd fall 2025 1.png`

Result files:

- OpenAI: `/tmp/eaglenet-openai-one.json`
- Gemini: `/tmp/eaglenet-gemini-one.json`

Observed:

- Both providers extracted `14` visible rows.
- Both derived `CSCD`.
- Both captured instructor, meeting time, and core row structure well.
- `room` was blank for both because that screenshot did not show rooms.
- OpenAI normalized day codes better for scheduler use.
- Gemini filled the full term label better from the folder hint.
- Gemini added noisier instructor values like `(Primary)`.

Tentative conclusion from this sample:

- OpenAI looked better for scheduler-ready row normalization.

### Spring folder sample

Input folder:

- `/Users/tmasingale/Downloads/cscd-cyber AY2025-26/cscd spring 2026`

Actual files present:

- `cscd-spring-2026-1.png`
- `cdcd-spring-2026-2.png`
- plus `.DS_Store`

Result files:

- OpenAI: `/tmp/eaglenet-openai-spring.json`
- Gemini: `/tmp/eaglenet-gemini-spring.json`

Observed:

- OpenAI extracted `41` rows.
- Gemini extracted `40` rows.
- Missing row in Gemini vs OpenAI: `CSCD 396-040`
- Both captured:
  - subject code
  - instructors
  - rooms
  - meeting days
  - meeting times
- Both correctly surfaced clarification needs for missing `CRN` and missing enrollment/seat data when those fields were not visible in the screenshots.
- OpenAI clarification questions were more scheduler-oriented.
- Gemini continued to add noisier values such as `(Primary)` in instructor names.
- OpenAI output handled the spring screenshots better overall and preserved the more useful structure for downstream scheduling.

Conclusion from spring sample:

- OpenAI again looks like the better primary extractor for eventual automation.

## Product / Architecture Direction Change

Important decision from the conversation:

- Stop paying API costs for broad bakeoffs during discovery.
- Use subscription-based manual model interaction for schema and prompt exploration first.
- Only use API automation later, once the schema and clarification flow are stable enough to justify recurring cost.

Reason:

- The paid API bakeoffs were useful to establish direction.
- But repeated API runs during first-build discovery are not cost-effective compared with using existing ChatGPT / Gemini subscriptions manually.

## Recommended Next Slice

Do **not** spend more time or money on more paid bakeoffs right now.

Recommended next implementation:

1. Lock the `EagleNETScreenshotRecord` schema in code.
2. Add a manual import path where a user can paste or upload structured JSON produced manually from ChatGPT/Gemini.
3. Add the clarification/review step on top of that structured JSON.
4. Build the scheduler grid from the clarified structured data.

This gives a working first-time pipeline without recurring API cost during discovery.

## Suggested Starting Point on the Next Machine

If continuing the bakeoff/schema track:

```bash
git fetch origin
git switch codex/issue-224
```

If continuing the screenshot onboarding UI/integration track:

```bash
git fetch origin
git switch codex/issue-217-screenshot-import
```

Then decide whether to:

- port the manual JSON intake into `codex/issue-217-screenshot-import`, or
- merge/rebase the useful bakeoff helpers from `codex/issue-224` into the onboarding branch

## Local-Only Notes

- `.env.local` exists in `/Users/tmasingale/Documents/GitHub/scheduler-v2-codex-224/.env.local` locally, but is not committed.
- Several result artifacts are in `/tmp` and will not transfer machines automatically:
  - `/tmp/eaglenet-openai-one.json`
  - `/tmp/eaglenet-gemini-one.json`
  - `/tmp/eaglenet-openai-spring.json`
  - `/tmp/eaglenet-gemini-spring.json`

If those artifacts matter on the next machine, rerun the CLI locally after restoring keys:

```bash
cd /Users/tmasingale/Documents/GitHub/scheduler-v2-codex-224
PORT=8123 HOST=127.0.0.1 npm start
```

Then, in another terminal:

```bash
npm run bakeoff:eaglenet -- "/Users/tmasingale/Downloads/cscd-cyber AY2025-26/cscd spring 2026" --providers openai --out /tmp/eaglenet-openai-spring.json
```

## One-Line Summary

`#224` is implemented and validated locally; OpenAI currently looks better than Gemini for EagleNET screenshot extraction, but the project should now pivot from paid API bakeoffs to a manual structured-JSON import flow for the first production-quality onboarding path.
