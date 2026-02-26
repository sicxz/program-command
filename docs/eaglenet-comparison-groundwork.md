# EagleNet Comparison Groundwork (Normalization + Diff Model)

Tracks issue `#14` groundwork for comparing Program Command scheduler schedules against EagleNet exports.

## Goal
Provide a deterministic normalization + diff pipeline so formatting differences do not create noisy false positives.

## Prototype Module
- `/Users/tmasingale/Documents/GitHub/scheduler-v2-codex/js/eaglenet-compare.js`

API surface (attached to `globalThis.EagleNetCompare`; also `module.exports` when loaded in a CommonJS context):
- `normalizeScheduleDataset(rows, options)`
- `diffNormalizedSchedules(leftRowsOrDataset, rightRowsOrDataset, options)`
- normalization helpers (`normalizeCourseCode`, `normalizeInstructorName`, `normalizeDays`, `normalizeTimeRange`, etc.)

## Import Assumptions (Initial)

The prototype accepts arrays of objects (CSV rows parsed elsewhere or app-generated rows). It supports common alias names for:
- academic year / term / quarter
- subject + catalog number or combined course code
- section / CRN
- title
- instructor
- meeting days
- start/end time or combined time range
- room / building
- credits
- modality / campus

This makes the compare logic usable before the final EagleNet import UI is built.

## Canonical Normalized Fields (Per Row)

The normalization model produces canonical values used for matching and field comparison:
- `academicYear` (e.g. `2026-27`)
- `quarter` (`Fall`, `Winter`, `Spring`, `Summer`)
- `courseCode` (e.g. `DESN 101`)
- `section` (padded/normalized, e.g. `001`)
- `crn`
- `title` + `titleKey`
- `instructor` + `instructorKey` (normalizes common formatting/abbreviation differences)
- `days` (normalized day pattern, e.g. `MWF`, `TR`)
- `timeRange` (24h normalized range, e.g. `09:00-10:15`)
- `room` + `roomKey`
- `credits`
- `modality` + `modalityKey`
- `campus` + `campusKey`

## Match Key / Identity Strategy

Primary comparison identity (`comparisonKey`) is built from:
- academic year
- quarter
- course identity (`courseCode + section`, or `CRN`, or fallback title/time identity)
- campus

Duplicate rows with the same identity are handled deterministically:
- grouped by `comparisonKey`
- sorted by normalized secondary fields (instructor, days, time, room, modality, credits, title)
- assigned stable duplicate suffixes (`::1`, `::2`, ...)

This prevents input-order-only differences from changing the diff result.

## Diff Categories

The prototype emits three top-level difference types:
- `missingInRight`: present in scheduler/left dataset but missing in EagleNet/right dataset
- `extraInRight`: present in EagleNet/right dataset but missing in scheduler/left dataset
- `fieldMismatches`: same matched row identity, but one or more compared fields differ

Default compared fields:
- `credits`
- `instructorKey`
- `days`
- `timeRange`
- `roomKey`
- `modalityKey`
- `campusKey`
- `titleKey`

## Common Formatting Mismatch Handling (Initial)

The prototype intentionally normalizes these before diffing:
- course code spacing/hyphen differences (`DESN101`, `DESN-101`, `DESN 101`)
- section zero-padding (`1` vs `001`)
- instructor name order / abbreviation (`Masingale, Thomas` vs `T Masingale`)
- day abbreviations (`TuTh`, `TR`, `T/R`)
- time formatting (`9:00 AM - 10:15 AM` vs `09:00-10:15`)
- room punctuation/spacing (`CAD-201` vs `CAD 201`)

## Known Limits (Groundwork Phase)

- No CSV parser is included yet (UI/import phase will parse files and feed row objects).
- Duplicate-section matching is deterministic but still simple; future UI/report work may need richer heuristics.
- The compare model is row/field oriented and does not yet group discrepancies by quarter or mismatch severity for chair-facing UI.

## Next Phase (`#15`)

Build a UI/report layer that:
- lets the user pick a year and load/choose EagleNet import data
- runs `diffNormalizedSchedules(...)`
- groups results by mismatch type and quarter
- supports an exportable discrepancy summary
