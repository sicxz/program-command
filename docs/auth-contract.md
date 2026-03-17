# Auth Contract (A-01)

Issue: [#87](https://github.com/sicxz/program-command/issues/87)  
Parent epic: [#86](https://github.com/sicxz/program-command/issues/86)

## 1) Provider Decision
Decision: use **Supabase Auth (email + password)** as the primary provider.

Rationale:
- already aligned with current Supabase-backed data architecture
- first-party JWT + RLS integration without additional auth proxy
- supports immediate rollout for A-02/A-03/A-05 with minimal system churn

Initial auth methods:
- enabled: email/password
- disabled for phase 1: social providers, anonymous auth

## 2) Role Model
Two application roles are in scope for phase 1:

- `admin`
  - platform/developer-level access
  - full read/write across scheduler data and program configuration
  - can invite/revoke users and assign roles

- `chair`
  - department/program operational editor
  - can edit scheduling/workload data for assigned program
  - no global platform administration

Role source of truth:
- role stored in auth claims (`app_metadata.role`) and enforced by RLS/policy layer
- application UI can additionally gate controls for UX clarity, but DB policy is authoritative

## 3) Session Lifecycle
Session flow:
1. user signs in (`/auth` flow)
2. client restores existing session on app load
3. active session continues with token refresh handled by Supabase client
4. inactivity timeout warning is shown before local session expiration
5. on timeout or invalid refresh token, user must re-authenticate

Timeout contract:
- UI idle warning threshold: 25 minutes inactivity
- forced sign-out target: 30 minutes inactivity
- absolute max session age before re-auth prompt: 8 hours

Notes:
- exact timers are enforced in A-10 implementation; values above are contract defaults

## 4) Token Storage Strategy
Decision: use Supabase JS managed session storage only.

Rules:
- do not manually persist JWTs in custom storage keys
- do not copy service-role credentials to browser runtime
- browser uses anon/publishable key + user session token
- privileged operations remain server-side or service-role only

## 5) Registration Model
Decision: **invite-only** registration for phase 1.

Contract:
- self-signup is disabled
- admins invite chair users
- invited users set password via Supabase invite/reset flow

Reasoning:
- avoids uncontrolled account creation during early multi-tenant rollout
- keeps role assignment and program scoping explicit

## 6) Permission Matrix (Phase 1)
Legend:
- `R` = read
- `I/U` = insert + update
- `D` = delete
- `-` = no direct access

| Table | chair | admin |
|---|---|---|
| `departments` | R | R/I/U/D |
| `academic_years` | R/I/U (scoped) | R/I/U/D |
| `rooms` | R/I/U (scoped) | R/I/U/D |
| `courses` | R/I/U (scoped) | R/I/U/D |
| `faculty` | R/I/U (scoped) | R/I/U/D |
| `scheduled_courses` | R/I/U (scoped) | R/I/U/D |
| `faculty_preferences` | R/I/U (scoped) | R/I/U/D |
| `scheduling_constraints` | R/I/U (scoped) | R/I/U/D |
| `release_time` | R/I/U (scoped) | R/I/U/D |
| `pathways` | R/I/U (scoped) | R/I/U/D |
| `pathway_courses` | R/I/U (scoped) | R/I/U/D |

Scoping contract:
- all chair writes must be constrained to the current program/department context
- all chair reads should be program-scoped once T-series multi-tenant schema lands

A-05 RLS enforcement contract:
- all write policies require `auth.uid() IS NOT NULL`
- `admin` role can INSERT/UPDATE/DELETE on scheduling tables and system config tables
- `chair` role can INSERT/UPDATE on scheduling tables, but cannot DELETE
- anonymous (`anon`) write attempts are denied by policy

## 7) Downstream Issue Contracts
This spec is normative input for:
- [#88](https://github.com/sicxz/program-command/issues/88) Supabase Auth sign-up/sign-in flow
- [#89](https://github.com/sicxz/program-command/issues/89) login UI/session indicator/logout
- [#90](https://github.com/sicxz/program-command/issues/90) role-based access control
- [#91](https://github.com/sicxz/program-command/issues/91) user-scoped RLS writes
- [#92](https://github.com/sicxz/program-command/issues/92) save attribution
- [#93](https://github.com/sicxz/program-command/issues/93) presence tracking
- [#94](https://github.com/sicxz/program-command/issues/94) edit-lock warnings
- [#95](https://github.com/sicxz/program-command/issues/95) unsaved-change guards
- [#96](https://github.com/sicxz/program-command/issues/96) timeout/auto-save/recovery
- [#97](https://github.com/sicxz/program-command/issues/97) auth + edit-state integration tests

## 8) Non-Goals (A-01)
- implementing UI auth screens
- implementing invite workflows
- implementing program multi-tenancy claims (`program_id`) end-to-end

Those are handled in subsequent A/T issues.

## 9) Environment Auth Enforcement
- Production/staging hosts enforce auth guard by default.
- Local development hosts (`localhost`, `127.0.0.1`, `::1`) bypass auth guard by default.
- Optional override controls:
  - query param: `?auth=required` or `?auth=disabled`
  - global flag before `auth-guard.js`: `window.PROGRAM_COMMAND_AUTH_MODE = 'required' | 'disabled'`
