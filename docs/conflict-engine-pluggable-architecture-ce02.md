# Conflict Engine Pluggable Architecture (CE-02)

Issue: [#142](https://github.com/sicxz/program-command/issues/142)

## Overview
Conflict Engine now operates as an orchestrator over registered rule plugins.

Core runtime flow:
1. resolve enabled constraints
2. resolve plugin by normalized `constraint_type`
3. run `plugin.detect(schedule, ruleDetails, constraint, context)`
4. apply CE-01 tier normalization + scoring
5. bucket into `conflicts`, `warnings`, `suggestions`

## RulePlugin Interface
```ts
interface RulePlugin {
  id: string;
  name: string;
  tier?: 'hard_block' | 'warning' | 'suggestion' | 'optimization';
  enabled?: boolean;
  weight?: number;
  detect(schedule: any[], ruleDetails: Record<string, any>, constraint: any, context: Record<string, any>): any[];
}
```

## Registry API
- `registerRule(plugin)`
- `enableRule(id)`
- `disableRule(id)`
- `setWeight(id, weight)`
- `listRules()`

## Backward Compatibility
- Existing `evaluate(schedule, constraints, context)` API remains unchanged.
- Added alias: `findIssues(schedule, constraints, context)`.
- Existing checker functions are still available via `ConflictEngine.checkers`.
- Existing conflict rules are pre-registered as built-in plugins during engine initialization.

## Per-Program Overrides
`evaluate(..., context)` supports optional rule overrides:
```js
{
  ruleOverrides: {
    student_conflict: { enabled: false },
    faculty_double_book: { weight: 1.5 }
  }
}
```

## Built-in Rules Registered as Plugins
- `room_restriction`
- `student_conflict`
- `faculty_double_book`
- `room_double_book`
- `evening_safety`
- `ay_setup_alignment`
- `enrollment_threshold`
- `campus_transition`
