# Workload Export Template Mapping (v1)

Template file:
- `/Users/tmasingale/Documents/GitHub/scheduler-v2-codex/docs/examples/workload/MasingaleT_Wkld_2526_20May2025.xlsx`

Sheet:
- `Sheet1` (15 rows x 17 columns)

Purpose:
- Chair-facing single-faculty workload sheet export (`.xlsx`) for preliminary AY planning.
- Preserve existing formatting and formulas in the template, then fill selected cells from scheduler/workload data.

## Cell Mapping (v1)

Auto-filled by exporter:

- `A1`: faculty role label for the selected AY (for example `Full Professor`, `Associate Professor`, `Senior Lecturer`, `Lecturer`)
- `A2`: faculty name
- `B1`: `Fall Quarter, <start year>`
- `E1`: `Winter Quarter, <end year>`
- `H1`: `Spring Quarter, <end year>`

Quarter course rows (6 slots per quarter):
- `B2:B7`: Fall course labels
- `C2:C7`: Fall notes/section (optional; v1 may leave blank or add lightweight notes)
- `D2:D7`: Fall workload credits
- `E2:E7`: Winter course labels
- `F2:F7`: Winter notes/section
- `G2:G7`: Winter workload credits
- `H2:H7`: Spring course labels
- `I2:I7`: Spring notes/section
- `J2:J7`: Spring workload credits

Workload summary (preliminary assumptions):
- `P2`: expected teaching credits (net teaching target for the AY)
- `P8`: expected administrative release / assigned time credits (from AY release settings when available)
- `O8`: assigned administrative release / assigned time credits (preliminary auto-fill; can include shortfall-to-target assumption)

Conditional defaults by faculty type:
- `O4`, `P4` (Scholarship/Research): preserved for tenure/tenure-track; set to `0` for lecturers in v1
- `O6`, `P6` (Service): preserved for tenure/tenure-track; set to `0` for lecturers in v1

## Formula Cells (Preserve)

The exporter must not overwrite template formulas:

- `D8`, `G8`, `J8`: quarter teaching totals
- `K8`: total teaching workload
- `O2`: assigned teaching workload (`=K8`)
- `Q2`, `Q4`, `Q6`, `Q8`: summary percentages
- `O10`, `P10`, `Q10`: workload (including PTOL) summary
- `D13`, `G13`, `J13`, `K13`: PTOL totals
- `O14`, `Q14`: net workload summary

## Export Data Rules (v1)

- Scheduled lecture/studio courses are listed individually by quarter.
- Applied learning courses (`DESN 399/491/495/499`) are aggregated into one per-quarter row labeled `DESN X95/99` using workload-equivalent credits (weighted).
- `TBD`/unassigned sections are excluded from faculty exports (already excluded from faculty totals in integrated workload data).
- Summer courses are ignored in v1 (template only has Fall/Winter/Spring columns).
- If a quarter exceeds 6 rows after aggregation, export should fail with a clear error (no silent truncation).

## Manual / Chair Review Fields (v1)

These remain manual or template-default unless AY setup data is available:

- Scholarship / research assigned credits (tenure-track cases)
- Service assigned credits
- PTOL entries and PTOL credits paid
- Any narrative annotations the chair wants to add

## Notes

- This mapping is intentionally template-specific for the Masingale workbook layout.
- Future work may support multiple workload templates or a template selector.
