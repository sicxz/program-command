# Public Schedule Release Checklist

Use this before sharing `public-schedule.html` outside the authenticated Program Command workflow.

## Dev Validation

- Apply `scripts/supabase-public-schedule-read.sql` to the dev Supabase project.
- Confirm the RPC exists: `public.get_public_schedule(text, text, text)`.
- Confirm anon can execute the RPC for `2026-27` / `ewu-design`.
- Confirm anon cannot insert, update, or delete `academic_years` or `scheduled_courses`.
- Open `public-schedule.html` signed out.
- Confirm the default view is `AY 2026-27`, `Fall 2026`.
- Confirm the public schedule rows match the authenticated scheduler for AY 2026-27 Fall.
- Open `index.html` signed out on a production-like host or with `?auth=required`; confirm it redirects to login.

## Production Rollout

- Apply `scripts/supabase-public-schedule-read.sql` to production before deploying the frontend.
- Verify AY `2026-27` exists for `ewu-design`.
- Verify Fall `scheduled_courses` rows exist and reflect the intended published schedule.
- Deploy the frontend containing `public-schedule.html`, `css/public-schedule.css`, and `pages/public-schedule.js`.
- Open the public URL in a private browser window.
- Confirm no Save, Add Course, import, dashboard, workload, or admin controls are visible.

## Rollback Trigger

- If the public page exposes editor controls, remove or block `public-schedule.html` from the deployment.
- If the RPC returns incorrect or overbroad data, revoke execute on `public.get_public_schedule(text, text, text)` from `anon` until the SQL is corrected.
- If protected routes stop redirecting signed-out users, roll back the frontend deploy.
