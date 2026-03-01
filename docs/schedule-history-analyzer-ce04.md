# Schedule History Analyzer (CE-04)

Issue: [#144](https://github.com/sicxz/program-command/issues/144)

## Module
`js/schedule-history-analyzer.js`

Singleton API:
- `analyzePatterns(scheduleHistory)`
- `identifySuccesses(patterns?)`
- `identifyProblems(patterns?)`
- `getRecommendations(patterns?)`

Utility:
- `parseCsv(csvText)`
- `getLastAnalysis()`

## Pattern Families
- `course_time_slot`
- `faculty_course_affinity`
- `quarter_demand`
- `section_optimization`

## Recommendation Types
- `preferred_time_slot`
- `faculty_affinity`
- `section_adjustment`
- `demand_pressure`

Each recommendation includes:
- confidence score
- plain-language explanation
- `learnedRule` payload for downstream conflict-engine registration

## Data Source Used
- `enrollment-data/processed/corrected-all-quarters.csv` (Fall 2022 through 2025-26 records)

## Explainability Contract
Every pattern and recommendation includes:
- metrics (`fillRate`, `waitlist`, and/or `sections`)
- sample size
- confidence score (0.1-0.99)
- natural-language rationale
