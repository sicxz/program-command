# Supabase Canonical Program Config Seed (T-07)

This script seeds the first canonical `programs.config` record so the runtime can resolve EWU Design from Supabase instead of staying in bootstrap-only mode.

Files:

- `scripts/supabase-program-config-seed-t07.sql`
- `department-profiles/design-v1.json`

## What It Does

`scripts/supabase-program-config-seed-t07.sql`:

1. Ensures `public.programs` exists.
2. Upserts the `ewu-design` program row.
3. Stores the Design runtime profile inside `programs.config.profile`.
4. Preserves bridge metadata alongside the profile:
   - `legacy_department_code = "DESN"`
   - `profile_schema_version = 1`
   - `profile_source = "department-profiles/design-v1.json"`

This is the bridge between the existing local profile artifacts and the canonical multi-program runtime path used by `js/profile-loader.js`.

## Run Order

For a base-schema develop database, run these after the existing writable-dev setup:

1. `scripts/supabase-schema.sql`
2. `scripts/seed-constraints.sql`
3. `scripts/supabase-schedule-sync-rpc.sql`
4. `scripts/supabase-program-config-seed-t07.sql`

If you already applied the multi-tenant program migrations, you can still run `scripts/supabase-program-config-seed-t07.sql` by itself. It is idempotent.

## Verification

Run this in Supabase SQL Editor:

```sql
select
  code,
  config->>'legacy_department_code' as legacy_department_code,
  config->>'profile_schema_version' as profile_schema_version,
  config->>'profile_source' as profile_source,
  config->'profile'->'identity'->>'code' as profile_identity_code,
  config->'profile'->'identity'->>'displayName' as profile_display_name
from public.programs
where code = 'ewu-design';
```

Expected result:

- `code = ewu-design`
- `legacy_department_code = DESN`
- `profile_schema_version = 1`
- `profile_source = department-profiles/design-v1.json`
- `profile_identity_code = DESN`
- `profile_display_name = EWU Design`

## Runtime Effect

After this seed is applied to develop:

- `ProfileLoader.init()` can resolve `ewu-design` from `public.programs`.
- The onboarding shell can move from bootstrap fallback toward canonical runtime resolution.
- The local profile files remain important as source artifacts, but Supabase becomes the release-gated runtime source for Design.
