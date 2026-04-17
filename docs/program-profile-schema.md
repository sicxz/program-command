# Program Profile Schema (v1)

Issue: [#103](https://github.com/sicxz/program-command/issues/103)

The authoritative v1 schema is documented in:

- [`docs/department-profile-schema-v1.md`](./department-profile-schema-v1.md)

This schema powers `programs.config` compatibility and runtime profile loading in:

- `js/department-profile.js`
- `department-profiles/design-v1.json` (EWU Design default profile)
- `scripts/supabase-program-config-seed-t07.sql` (canonical Supabase seed for `programs.config`)

## Canonical Storage Shape

The runtime loader accepts either of these `programs.config` shapes:

1. Raw profile JSON that directly matches the v1 schema.
2. An envelope object with the runtime profile stored under `config.profile`.

The canonical Design seed now uses the envelope form so metadata can live alongside the runtime profile:

- `legacy_department_code`
- `profile_schema_version`
- `profile_source`
- `profile`

## Validation Function

Runtime validator:

- `DepartmentProfileManager.validateProfile(profile)`

Returns:

- `valid` (boolean)
- `errors` (array of strings)
- `warnings` (array of strings)
- `normalizedProfile` (profile with v1 defaults applied)
