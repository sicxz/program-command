# Auth Identity Linking (OAuth)

This document defines provider linking with Supabase Auth as the source of truth.

## Goals
- One internal `user_id` per account.
- Multiple login methods (password + OAuth) linked to that same `user_id`.
- No implicit email-based account merges.

## Security Contract
- OAuth providers supported: `google`, `github`, `apple`.
- PKCE flow is enabled in the Supabase client (`flowType: 'pkce'`).
- Redirect target is restricted to same-origin `/login.html`.
- Linking requires an authenticated existing session.
- Provider subject ID is used as stable key; not email.

## Schema
Run:
- `scripts/supabase-auth-identity-linking.sql`

Creates:
- `public.user_identities`

Key constraints:
- `UNIQUE (provider, provider_user_id)`
- `UNIQUE (user_id, provider)`

RLS policies:
- authenticated users can only read/write their own identity rows.

## Existing User Backfill
Migration reads `auth.identities` and inserts provider rows into `public.user_identities`.

Backfill behavior:
- provider key is `sub` (preferred), then provider `id`, then identity row id fallback.
- no merge by email.

## User Flows
### OAuth Sign-In
- user clicks provider on `login.html`
- app stores OAuth intent in session storage
- callback handled on `login.html`
- app syncs linked identity rows for returned provider session

### Provider Linking (Existing Account)
- user signs into existing account first
- user clicks **Link login** in session indicator
- app opens linking mode on `login.html?mode=link`
- user clicks connect provider
- callback binds provider identity to current authenticated user

## Provider Quirks
- Apple may return private relay email and may only return name/email once.
- GitHub email can be missing/hidden/unverified.
- stable provider subject ID is authoritative; email is informational only.
