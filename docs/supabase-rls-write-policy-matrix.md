# Supabase RLS Write-Policy Matrix (Tree/C-05)

## Purpose

Define the canonical role-by-table write policy for scheduling data before implementing hardening migrations in C-06.

## Roles

- `anon`: unauthenticated browser clients using the public key.
- `authenticated`: signed-in users. Write access must be constrained to authorized department scope.
- `service_role`: server-side/migration automation role with full access.

## Policy Matrix

`ALLOW` means a policy should explicitly permit the operation for the role. `DENY` means no write policy should allow the operation for that role.

| Table | anon SELECT | anon INSERT | anon UPDATE | anon DELETE | authenticated SELECT | authenticated INSERT | authenticated UPDATE | authenticated DELETE | service_role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `departments` | ALLOW | DENY | DENY | DENY | ALLOW | DENY | DENY | DENY | ALLOW |
| `academic_years` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (dept-scoped) | ALLOW (dept-scoped) | DENY | ALLOW |
| `rooms` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (dept-scoped) | ALLOW (dept-scoped) | DENY | ALLOW |
| `courses` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (dept-scoped) | ALLOW (dept-scoped) | DENY | ALLOW |
| `faculty` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (dept-scoped) | ALLOW (dept-scoped) | DENY | ALLOW |
| `scheduled_courses` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (year+dept scoped) | ALLOW (year+dept scoped) | ALLOW (year+dept scoped) | ALLOW |
| `faculty_preferences` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (faculty/dept scoped) | ALLOW (faculty/dept scoped) | ALLOW (faculty/dept scoped) | ALLOW |
| `scheduling_constraints` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (dept-scoped) | ALLOW (dept-scoped) | ALLOW (dept-scoped) | ALLOW |
| `release_time` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (faculty+year+dept scoped) | ALLOW (faculty+year+dept scoped) | ALLOW (faculty+year+dept scoped) | ALLOW |
| `pathways` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (dept-scoped) | ALLOW (dept-scoped) | ALLOW (dept-scoped) | ALLOW |
| `pathway_courses` | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW (dept-scoped via pathway join) | ALLOW (dept-scoped via pathway join) | ALLOW (dept-scoped via pathway join) | ALLOW |

## Required Security Assertions

- Anonymous write/delete is denied for all scheduling tables.
- Anonymous reads remain allowed for current client behavior unless product requirements change.
- Authenticated writes are department-scoped (and year-scoped where applicable).
- `service_role` remains unrestricted for migrations, imports, and server-controlled jobs.

## Policy Predicate Requirements for C-06

Authenticated write policies should enforce all of the following:

1. `auth.uid()` is present.
2. The caller is authorized for the target department.
3. Row joins are validated where the table does not carry `department_id` directly.

Recommended join checks:

- `scheduled_courses`: join `academic_years` -> `department_id`
- `faculty_preferences`: join `faculty` -> `department_id`
- `release_time`: join `faculty` and/or `academic_years` -> `department_id`
- `pathway_courses`: join `pathways` -> `department_id`

## Current Gap (from `scripts/supabase-schema.sql`)

The schema currently defines broad `FOR ALL TO authenticated USING (true) WITH CHECK (true)` write policies. That blocks anonymous writes but does not enforce department-scoped authorization.

## Handoff

- C-06 uses this matrix to implement migration SQL.
- C-07 verifies effective behavior with a policy smoke-check script.
- C-08 captures live verification evidence against the deployed environment.

## References

- Issue: [#57](https://github.com/sicxz/program-command/issues/57)
- Next implementation: [#58](https://github.com/sicxz/program-command/issues/58)
- Schema source: [scripts/supabase-schema.sql](../scripts/supabase-schema.sql)
