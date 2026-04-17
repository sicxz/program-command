# Multi-Department Blockers

This document is the clean blocker list for phase-2 department onboarding. It is derived from the platformization audit and should stay short, explicit, and decision-oriented.

## Blocking Categories

### 1. Canonical Runtime Identity

- The release-gated runtime must not depend on `DESN` / `Design` fallbacks to determine live department identity.
- The app needs one clear resolution order for department or program context.

### 2. Canonical Profile Source

- The platform must define whether release-gated configuration is driven by local profile files, Supabase-backed program config, or a clearly bounded hybrid model.
- Competing fallback models cannot remain implicit.

### 3. Bootstrap vs Platform Contract

- Using `design-v1` as a bootstrap seed may be acceptable during setup work.
- It is not acceptable as the hidden long-term model for all future departments.

### 4. Onboarding Contract

- The onboarding flow must describe the real platform state, not only the local profile activation path.
- Another department cannot be onboarded while the onboarding contract is still ahead of the platform.

### 5. Department-Scoped Persistence Expectations

- Department-scoped DB behavior must be explicit in both canonical and degraded states.
- The release gate fails if production behavior becomes ambiguous when canonical department context is missing.

## Decision Rule

Phase 2 cannot begin while any blocker above remains unresolved for release-gated behavior.
