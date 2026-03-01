# Program Profile Schema (v1)

Issue: [#103](https://github.com/sicxz/program-command/issues/103)

The authoritative v1 schema is documented in:

- [`docs/department-profile-schema-v1.md`](./department-profile-schema-v1.md)

This schema powers `programs.config` compatibility and runtime profile loading in:

- `js/department-profile.js`
- `department-profiles/design-v1.json` (EWU Design default profile)

## Validation Function

Runtime validator:

- `DepartmentProfileManager.validateProfile(profile)`

Returns:

- `valid` (boolean)
- `errors` (array of strings)
- `warnings` (array of strings)
- `normalizedProfile` (profile with v1 defaults applied)
