-- MarketScout AI: Instagram profile cache
-- Independent from the x402 payment ledger.
-- Apply manually after review.

CREATE TABLE IF NOT EXISTS public.marketscout_profile_cache (
  username text PRIMARY KEY,
  report jsonb NOT NULL,
  source text NOT NULL,
  network text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketscout_cache_username_valid
    CHECK (
      username ~ '^[a-z0-9._]{1,30}$'
      AND username NOT LIKE '.%'
      AND username NOT LIKE '%.'
      AND username NOT LIKE '%..%'
    ),

  CONSTRAINT marketscout_cache_report_object
    CHECK (jsonb_typeof(report) = 'object'),

  CONSTRAINT marketscout_cache_expiry_valid
    CHECK (expires_at > fetched_at)
);

ALTER TABLE public.marketscout_profile_cache
  ENABLE ROW LEVEL SECURITY;

-- No public read/write policies.
-- Only trusted server-side service-role access is intended.

REVOKE ALL ON TABLE public.marketscout_profile_cache
  FROM PUBLIC, anon, authenticated;

-- Explicitly permit trusted backend access.
-- Never expose the service-role key to browser clients.
GRANT SELECT, INSERT, UPDATE
ON TABLE public.marketscout_profile_cache
TO service_role;

CREATE INDEX IF NOT EXISTS
  marketscout_profile_cache_expires_idx
  ON public.marketscout_profile_cache (expires_at);

COMMENT ON TABLE public.marketscout_profile_cache IS
  'Cached Instagram intelligence purchased or obtained by MarketScout.';
