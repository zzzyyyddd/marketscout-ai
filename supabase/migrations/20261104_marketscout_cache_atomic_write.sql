-- MarketScout AI: atomic profile cache write.
-- Review before applying to Supabase.
-- Requires 20261103_marketscout_profile_cache.sql.

CREATE OR REPLACE FUNCTION public.marketscout_store_profile_cache(
  p_username text,
  p_report jsonb,
  p_source text,
  p_network text,
  p_fetched_at timestamptz,
  p_ttl_seconds integer DEFAULT 86400
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_username text;
  v_rows integer;
BEGIN
  v_username := lower(trim(p_username));

  IF
    v_username IS NULL
    OR v_username !~ '^[a-z0-9._]{1,30}$'
    OR v_username LIKE '.%'
    OR v_username LIKE '%.'
    OR v_username LIKE '%..%'
  THEN
    RAISE EXCEPTION 'Invalid cache username';
  END IF;

  IF
    p_report IS NULL
    OR jsonb_typeof(p_report) <> 'object'
    OR p_report->>'username' IS NULL
    OR lower(p_report->>'username') <> v_username
  THEN
    RAISE EXCEPTION 'Cache report username mismatch';
  END IF;

  IF
    p_source IS NULL
    OR p_source <> 'live'
    OR p_network IS NULL
    OR p_network <> 'celo-sepolia'
  THEN
    RAISE EXCEPTION 'Invalid cache provenance';
  END IF;

  IF
    p_fetched_at IS NULL
    OR p_fetched_at > now() + interval '1 minute'
    OR p_fetched_at < now() - interval '5 minutes'
    OR p_ttl_seconds <> 86400
  THEN
    RAISE EXCEPTION 'Invalid cache timestamp or TTL';
  END IF;

  INSERT INTO public.marketscout_profile_cache (
    username,
    report,
    source,
    network,
    fetched_at,
    expires_at
  )
  VALUES (
    v_username,
    p_report,
    p_source,
    p_network,
    p_fetched_at,
    p_fetched_at + make_interval(secs => p_ttl_seconds)
  )
  ON CONFLICT (username)
  DO UPDATE SET
    report = EXCLUDED.report,
    source = EXCLUDED.source,
    network = EXCLUDED.network,
    fetched_at = EXCLUDED.fetched_at,
    expires_at = EXCLUDED.expires_at
  WHERE
    public.marketscout_profile_cache.fetched_at
      < EXCLUDED.fetched_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION
  public.marketscout_store_profile_cache(
    text, jsonb, text, text, timestamptz, integer
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.marketscout_store_profile_cache(
    text, jsonb, text, text, timestamptz, integer
  )
TO service_role;
