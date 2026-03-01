-- Auth identity linking table and policies
-- Goal: maintain one internal user_id and allow multiple linked OAuth identities.
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    provider_email TEXT,
    identity_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_identities_provider_check CHECK (provider IN ('google', 'github', 'apple')),
    CONSTRAINT user_identities_provider_subject_unique UNIQUE (provider, provider_user_id),
    CONSTRAINT user_identities_user_provider_unique UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON public.user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_identities_provider_subject ON public.user_identities(provider, provider_user_id);

CREATE OR REPLACE FUNCTION public.touch_user_identities_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_user_identities_updated_at ON public.user_identities;
CREATE TRIGGER trg_touch_user_identities_updated_at
    BEFORE UPDATE ON public.user_identities
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_user_identities_updated_at();

ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_identities_select_own" ON public.user_identities;
CREATE POLICY "user_identities_select_own"
    ON public.user_identities
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_identities_insert_own" ON public.user_identities;
CREATE POLICY "user_identities_insert_own"
    ON public.user_identities
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_identities_update_own" ON public.user_identities;
CREATE POLICY "user_identities_update_own"
    ON public.user_identities
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_identities_delete_own" ON public.user_identities;
CREATE POLICY "user_identities_delete_own"
    ON public.user_identities
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- Backfill from Supabase auth identities for supported OAuth providers.
-- Uses provider subject/id as stable key. No email-based merges.
INSERT INTO public.user_identities (
    user_id,
    provider,
    provider_user_id,
    provider_email,
    identity_data,
    linked_at,
    updated_at
)
SELECT
    i.user_id,
    lower(i.provider) AS provider,
    COALESCE(i.identity_data->>'sub', i.identity_data->>'id', i.id::text) AS provider_user_id,
    i.identity_data->>'email' AS provider_email,
    COALESCE(i.identity_data, '{}'::jsonb) AS identity_data,
    COALESCE(i.created_at, NOW()) AS linked_at,
    COALESCE(i.updated_at, NOW()) AS updated_at
FROM auth.identities i
WHERE lower(i.provider) IN ('google', 'github', 'apple')
  AND COALESCE(i.identity_data->>'sub', i.identity_data->>'id', i.id::text) IS NOT NULL
ON CONFLICT (provider, provider_user_id) DO NOTHING;

COMMIT;
