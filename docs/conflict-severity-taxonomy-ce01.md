# Conflict Severity Taxonomy (CE-01)

Issue: [#141](https://github.com/sicxz/program-command/issues/141)

## Purpose
Define the canonical 4-tier severity model for Conflict Engine v2 while preserving legacy `critical|warning|info` compatibility in current UI/test flows.

## Canonical Tiers
| Tier | Score Range | Meaning | UX Treatment | Save Behavior |
|---|---:|---|---|---|
| `hard_block` | 90-100 | Non-negotiable constraint violation | Red blocking banner/card | Save blocked |
| `warning` | 50-89 | Real problem that should be fixed | Yellow warning card with acknowledge path | Save allowed with acknowledgment |
| `suggestion` | 20-49 | Actionable improvement opportunity | Blue info card, dismissible | Save allowed |
| `optimization` | 1-19 | Nice-to-have quality optimization | Green tip, collapsible by default | Save allowed |

## Legacy Compatibility
`critical -> hard_block`, `warning -> warning`, `info -> suggestion`.

For existing rendering/tests, engine still emits `severity` as legacy values (`critical|warning|info`) and adds canonical `severityTier`/`tier`.

## Current Conflict-Type Mapping (8 Existing Types)
| Constraint Type | Default Tier | Rationale |
|---|---|---|
| `faculty_double_book` | `hard_block` | Instructor cannot teach two rooms at once |
| `room_double_book` | `hard_block` | Physical room collision is unschedulable |
| `student_conflict` | `warning` | Pathway conflict is serious but often resolvable |
| `room_restriction` | `warning` | Usually fixable by room/time adjustment |
| `evening_safety` | `warning` | Operational risk, requires review |
| `ay_setup_alignment` | `warning` | Planning drift should be corrected before finalization |
| `enrollment_threshold` | `suggestion` | Forecast/quality signal, not hard invalidity |
| `campus_transition` | `suggestion` | Scheduling quality concern by default |

## Escalation / Demotion Rules
1. Student pathway conflict promotion:
- If `daysUntilGraduation <= 45` and tier is `suggestion`, promote to `warning`.
- If `daysUntilGraduation <= 14`, issue is upper-division/graduation-critical, and tier is `warning`, promote to `hard_block`.

2. Student pathway conflict demotion:
- If `daysUntilGraduation >= 120`, tier is `warning`, and `pathwayImpactScore <= 8`, demote to `suggestion`.

3. Room restriction escalation:
- If room-fit result is `blocked`, force tier to `hard_block`.

## Type Definitions (Documentation-Only)
```ts
export type ConflictSeverityTier =
  | 'hard_block'
  | 'warning'
  | 'suggestion'
  | 'optimization';

export type LegacySeverity = 'critical' | 'warning' | 'info';

export interface ConflictIssue {
  constraintId?: string;
  constraintType?: string;
  severity: LegacySeverity;        // backward compatibility
  severityTier: ConflictSeverityTier; // canonical CE-01 tier
  tier: ConflictSeverityTier;      // alias of severityTier
  blocksSave: boolean;
  title: string;
  description: string;
  score?: number;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  courses?: Array<Record<string, unknown>>;
  suggestion?: string;
}

export interface ConflictSummary {
  totalIssues: number;            // backward-compatible actionable count
  totalActionableIssues: number;  // hard_block + warning
  totalTieredIssues: number;      // all tiers
  criticalCount: number;          // hard_block count (legacy name)
  warningCount: number;
  tierCounts: Record<ConflictSeverityTier, number>;
  weightedScore: number;
  weightedByConstraintType: Record<string, number>;
}
```

## Code Touchpoints
- `js/config/constants.js` (`CONFLICTS` section)
- `js/conflict-engine.js` (tier normalization, scoring, and result bucketing)
