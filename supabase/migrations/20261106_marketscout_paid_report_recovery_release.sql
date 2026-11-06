-- MarketScout AI: payment-bound report recovery
-- Release candidate: review and apply only to the intended MarketScout database.

CREATE TABLE IF NOT EXISTS marketscout.paid_reports (
  reservation_id uuid PRIMARY KEY
    REFERENCES marketscout.payment_ledger(id)
    ON DELETE RESTRICT,

  username text NOT NULL,
  report jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT paid_reports_username_valid CHECK (
    username ~ '^[a-z0-9._]{1,30}$'
    AND username NOT LIKE '.%'
    AND username NOT LIKE '%.'
    AND username NOT LIKE '%..%'
  ),

  CONSTRAINT paid_reports_report_valid CHECK (
    jsonb_typeof(report) = 'object'
    AND lower(report->>'username') = username
  )
);

ALTER TABLE marketscout.paid_reports
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE marketscout.paid_reports
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT
ON TABLE marketscout.paid_reports
TO service_role;

CREATE INDEX IF NOT EXISTS
  paid_reports_username_idx
ON marketscout.paid_reports(username);

COMMENT ON TABLE marketscout.paid_reports IS
  'Reports bound to verified MarketScout payments. '
  'Access must be authorized by trusted server-side code.';

-- The purchased username is recorded at reservation creation.
ALTER TABLE marketscout.payment_ledger
  ADD COLUMN IF NOT EXISTS requested_username text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'marketscout.payment_ledger'::regclass
      AND conname = 'payment_requested_username_valid'
  ) THEN
    ALTER TABLE marketscout.payment_ledger
      ADD CONSTRAINT payment_requested_username_valid
      CHECK (
        requested_username IS NULL
        OR (
          requested_username ~ '^[a-z0-9._]{1,30}$'
          AND requested_username NOT LIKE '.%'
          AND requested_username NOT LIKE '%.'
          AND requested_username NOT LIKE '%..%'
        )
      );
  END IF;
END;
$$;

-- Prevent changes to a purchased username after reservation.
-- Preserve the existing payment-evidence protection behavior.

CREATE OR REPLACE FUNCTION marketscout.protect_paid_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.requested_username IS DISTINCT FROM NEW.requested_username
  THEN
    RAISE EXCEPTION 'Purchased username is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_username_immutable
ON marketscout.payment_ledger;

CREATE TRIGGER payment_username_immutable
BEFORE UPDATE ON marketscout.payment_ledger
FOR EACH ROW
EXECUTE FUNCTION marketscout.protect_paid_username();

-- Store a delivered report only for a verified Mainnet payment.
-- Callable by trusted service-role backend only.

CREATE OR REPLACE FUNCTION public.marketscout_store_paid_report(
  p_reservation_id uuid,
  p_username text,
  p_report jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_username text;
  v_payment marketscout.payment_ledger%ROWTYPE;
  v_existing jsonb;
BEGIN
  v_username := lower(trim(p_username));

  IF p_reservation_id IS NULL
     OR v_username IS NULL
     OR v_username !~ '^[a-z0-9._]{1,30}$'
     OR v_username LIKE '.%'
     OR v_username LIKE '%.'
     OR v_username LIKE '%..%'
     OR p_report IS NULL
     OR jsonb_typeof(p_report) <> 'object'
     OR lower(p_report->>'username') IS DISTINCT FROM v_username
  THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_payment
  FROM marketscout.payment_ledger
  WHERE id = p_reservation_id
  FOR SHARE;

  IF NOT FOUND
     OR v_payment.status <> 'confirmed'
     OR v_payment.reconciliation_status <> 'verified'
     OR v_payment.network <> 'celo'
     OR v_payment.requested_username IS DISTINCT FROM v_username
     OR v_payment.tx_hash IS NULL
     OR v_payment.tx_hash !~ '^0x[0-9a-fA-F]{64}$'
  THEN
    RETURN false;
  END IF;

  INSERT INTO marketscout.paid_reports (
    reservation_id,
    username,
    report
  )
  VALUES (
    p_reservation_id,
    v_username,
    p_report
  )
  ON CONFLICT (reservation_id) DO NOTHING;

  SELECT report
  INTO v_existing
  FROM marketscout.paid_reports
  WHERE reservation_id = p_reservation_id
    AND username = v_username;

  RETURN FOUND AND v_existing = p_report;
END;
$$;

REVOKE ALL ON FUNCTION
public.marketscout_store_paid_report(uuid,text,jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.marketscout_store_paid_report(uuid,text,jsonb)
TO service_role;

-- Atomic reservation with username binding.
-- New signature avoids modifying the existing production RPC.
-- The application must switch to this RPC before release.

CREATE OR REPLACE FUNCTION public.marketscout_reserve_mainnet_report(
  p_id uuid,
  p_payer text,
  p_nonce text,
  p_valid_after bigint,
  p_valid_before bigint,
  p_username text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_used bigint;
  v_username text := lower(trim(p_username));
BEGIN
  IF p_id IS NULL
     OR p_payer IS NULL
     OR p_payer !~ '^0x[0-9a-fA-F]{40}$'
     OR p_nonce IS NULL
     OR p_nonce !~ '^0x[0-9a-fA-F]{64}$'
     OR p_valid_after IS NULL
     OR p_valid_before IS NULL
     OR p_valid_after < 0
     OR p_valid_after > extract(epoch FROM now())::bigint
     OR p_valid_before <= extract(epoch FROM now())::bigint
     OR p_valid_before >
        extract(epoch FROM now())::bigint + 300
     OR v_username IS NULL
     OR v_username !~ '^[a-z0-9._]{1,30}$'
     OR v_username LIKE '.%'
     OR v_username LIKE '%.'
     OR v_username LIKE '%..%'
  THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(42220, 50000);

  SELECT COALESCE(SUM(amount_atomic), 0)
  INTO v_used
  FROM marketscout.payment_ledger
  WHERE payment_day = v_today
    AND status IN ('reserved', 'confirmed', 'ambiguous');

  IF v_used + 5000 > 50000 THEN
    RETURN false;
  END IF;

  INSERT INTO marketscout.payment_ledger (
    id,
    payment_day,
    amount_atomic,
    status,
    payer_address,
    recipient_address,
    token_address,
    authorization_amount_atomic,
    authorization_nonce,
    valid_after,
    valid_before,
    network,
    reconciliation_status,
    requested_username
  )
  VALUES (
    p_id,
    v_today,
    5000,
    'reserved',
    lower(p_payer),
    lower('0x20faAca5F980E29639A0FCC6dcA6988E18ed333B'),
    lower('0xcebA9300f2b948710d2653dD7B07f33A8B32118C'),
    5000,
    lower(p_nonce),
    p_valid_after,
    p_valid_before,
    'celo',
    'pending',
    v_username
  );

  RETURN true;

EXCEPTION
  WHEN unique_violation OR check_violation THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION
public.marketscout_reserve_mainnet_report(
  uuid,text,text,bigint,bigint,text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.marketscout_reserve_mainnet_report(
  uuid,text,text,bigint,bigint,text
)
TO service_role;

-- Backend-only report lookup.
-- The public API must verify wallet ownership before calling this.
-- Reservation ID alone is NOT proof of ownership.

CREATE OR REPLACE FUNCTION public.marketscout_read_paid_report(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_report jsonb;
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.report
  INTO v_report
  FROM marketscout.paid_reports AS r
  JOIN marketscout.payment_ledger AS l
    ON l.id = r.reservation_id
  WHERE r.reservation_id = p_reservation_id
    AND l.status = 'confirmed'
    AND l.reconciliation_status = 'verified'
    AND l.network = 'celo'
    AND l.requested_username = r.username
  LIMIT 1;

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION
public.marketscout_read_paid_report(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.marketscout_read_paid_report(uuid)
TO service_role;


-- Paid report immutability hardening (STEP 705).
-- Only the trusted store RPC should insert verified reports.

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE marketscout.paid_reports
FROM service_role;

CREATE OR REPLACE FUNCTION marketscout.protect_paid_report()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Paid reports are immutable';
END;
$$;

DROP TRIGGER IF EXISTS paid_report_immutable
ON marketscout.paid_reports;

CREATE TRIGGER paid_report_immutable
BEFORE UPDATE OR DELETE
ON marketscout.paid_reports
FOR EACH ROW
EXECUTE FUNCTION marketscout.protect_paid_report();



-- STEP 709: Single-use wallet recovery challenges.
-- Store only a SHA-256 hash of the challenge nonce.

CREATE TABLE IF NOT EXISTS marketscout.recovery_challenges (
  nonce_hash text PRIMARY KEY,
  reservation_id uuid NOT NULL
    REFERENCES marketscout.payment_ledger(id)
    ON DELETE RESTRICT,
  payer text NOT NULL,
  domain text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,

  CONSTRAINT recovery_nonce_hash_valid CHECK (
    nonce_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT recovery_payer_valid CHECK (
    payer ~ '^0x[0-9a-fA-F]{40}$'
  ),
  CONSTRAINT recovery_lifetime_valid CHECK (
    expires_at > issued_at
    AND expires_at <= issued_at + interval '5 minutes'
  )
);

ALTER TABLE marketscout.recovery_challenges
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE marketscout.recovery_challenges
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE marketscout.recovery_challenges
TO service_role;

CREATE INDEX IF NOT EXISTS recovery_challenges_reservation_idx
ON marketscout.recovery_challenges(reservation_id);

CREATE INDEX IF NOT EXISTS recovery_challenges_expiry_idx
ON marketscout.recovery_challenges(expires_at);


-- STEP 710: Issue payer-bound recovery challenge.
-- Called only by the trusted backend.
-- Issuing a challenge does not grant access to a report.

CREATE OR REPLACE FUNCTION public.marketscout_issue_recovery_challenge(
  p_nonce_hash text,
  p_reservation_id uuid,
  p_payer text,
  p_domain text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_payer text := lower(trim(p_payer));
BEGIN
  IF p_nonce_hash IS NULL
     OR p_nonce_hash !~ '^[0-9a-f]{64}$'
     OR p_reservation_id IS NULL
     OR v_payer IS NULL
     OR v_payer !~ '^0x[0-9a-f]{40}$'
     OR p_domain IS NULL
     OR p_domain !~ '^[a-z0-9.-]+(:[0-9]{1,5})?$'
     OR p_issued_at IS NULL
     OR p_expires_at IS NULL
     OR p_issued_at > now() + interval '30 seconds'
     OR p_issued_at < now() - interval '30 seconds'
     OR p_expires_at <= now()
     OR p_expires_at > p_issued_at + interval '5 minutes'
  THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM marketscout.payment_ledger AS l
    WHERE l.id = p_reservation_id
      AND lower(l.payer_address) = v_payer
      AND l.status = 'confirmed'
      AND l.reconciliation_status = 'verified'
      AND l.network = 'celo'
      AND l.requested_username IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  -- Serialize challenge issuance for this reservation.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_reservation_id::text, 0)
  );

  IF (
    SELECT count(*)
    FROM marketscout.recovery_challenges
    WHERE reservation_id = p_reservation_id
      AND consumed_at IS NULL
      AND expires_at > now()
  ) >= 3 THEN
    RETURN false;
  END IF;

  INSERT INTO marketscout.recovery_challenges (
    nonce_hash,
    reservation_id,
    payer,
    domain,
    issued_at,
    expires_at
  )
  VALUES (
    p_nonce_hash,
    p_reservation_id,
    v_payer,
    p_domain,
    p_issued_at,
    p_expires_at
  );

  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION
public.marketscout_issue_recovery_challenge(
  text,uuid,text,text,timestamptz,timestamptz
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.marketscout_issue_recovery_challenge(
  text,uuid,text,text,timestamptz,timestamptz
)
TO service_role;

-- STEP 711: Atomic recovery redemption.
-- Backend MUST verify the wallet signature before invoking this RPC.
-- A nonce can retrieve a report only once.

CREATE OR REPLACE FUNCTION public.marketscout_redeem_recovery_challenge(
  p_nonce_hash text,
  p_reservation_id uuid,
  p_payer text,
  p_domain text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_report jsonb;
BEGIN
  IF p_nonce_hash IS NULL
     OR p_nonce_hash !~ '^[0-9a-f]{64}$'
     OR p_reservation_id IS NULL
     OR p_payer IS NULL
     OR p_payer !~ '^0x[0-9a-fA-F]{40}$'
     OR p_domain IS NULL
  THEN
    RETURN NULL;
  END IF;

  UPDATE marketscout.recovery_challenges AS c
  SET consumed_at = now()
  FROM marketscout.payment_ledger AS l
  WHERE c.nonce_hash = p_nonce_hash
    AND c.reservation_id = p_reservation_id
    AND c.payer = lower(p_payer)
    AND c.domain = p_domain
    AND c.issued_at = p_issued_at
    AND c.expires_at = p_expires_at
    AND c.consumed_at IS NULL
    AND c.issued_at <= now()
    AND c.expires_at > now()
    AND l.id = c.reservation_id
    AND lower(l.payer_address) = c.payer
    AND l.status = 'confirmed'
    AND l.reconciliation_status = 'verified'
    AND l.network = 'celo'
    AND l.requested_username IS NOT NULL
  RETURNING (
    SELECT r.report
    FROM marketscout.paid_reports AS r
    WHERE r.reservation_id = l.id
      AND r.username = l.requested_username
  )
  INTO v_report;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION
public.marketscout_redeem_recovery_challenge(text,uuid,text,text,timestamptz,timestamptz)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.marketscout_redeem_recovery_challenge(text,uuid,text,text,timestamptz,timestamptz)
TO service_role;
