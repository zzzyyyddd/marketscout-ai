-- MAINNET RELEASE CANDIDATE — NOT APPROVED FOR PRODUCTION

BEGIN;


ALTER TABLE marketscout.payment_ledger
  ADD COLUMN IF NOT EXISTS payer_address text,
  ADD COLUMN IF NOT EXISTS authorization_nonce text,
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS tx_hash text,
  ADD COLUMN IF NOT EXISTS reconciliation_status text,
  ADD COLUMN IF NOT EXISTS token_address text,
  ADD COLUMN IF NOT EXISTS recipient_address text,
  ADD COLUMN IF NOT EXISTS authorization_amount_atomic bigint,
  ADD COLUMN IF NOT EXISTS valid_after bigint,
  ADD COLUMN IF NOT EXISTS valid_before bigint;



-- SOURCE: 20261104_marketscout_payment_evidence.sql


-- MarketScout AI payment evidence
-- Draft migration: do not apply to production before testing.


ALTER TABLE marketscout.payment_ledger
  ADD COLUMN IF NOT EXISTS tx_hash text,
  ADD COLUMN IF NOT EXISTS authorization_nonce text,
  ADD COLUMN IF NOT EXISTS payer_address text,
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS reconciliation_status text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'payment_ledger_tx_hash_format_check'
      AND conrelid = 'marketscout.payment_ledger'::regclass
  ) THEN
    ALTER TABLE marketscout.payment_ledger
      ADD CONSTRAINT payment_ledger_tx_hash_format_check CHECK (
    tx_hash IS NULL
    OR tx_hash ~ '^0x[0-9a-fA-F]{64}$'
  );
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'payment_ledger_nonce_format_check'
      AND conrelid = 'marketscout.payment_ledger'::regclass
  ) THEN
    ALTER TABLE marketscout.payment_ledger
      ADD CONSTRAINT payment_ledger_nonce_format_check CHECK (
    authorization_nonce IS NULL
    OR authorization_nonce ~ '^0x[0-9a-fA-F]{64}$'
  );
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'payment_ledger_payer_format_check'
      AND conrelid = 'marketscout.payment_ledger'::regclass
  ) THEN
    ALTER TABLE marketscout.payment_ledger
      ADD CONSTRAINT payment_ledger_payer_format_check CHECK (
    payer_address IS NULL
    OR payer_address ~ '^0x[0-9a-fA-F]{40}$'
  );
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'payment_ledger_reconciliation_status_check'
      AND conrelid = 'marketscout.payment_ledger'::regclass
  ) THEN
    ALTER TABLE marketscout.payment_ledger
      ADD CONSTRAINT payment_ledger_reconciliation_status_check CHECK (
    reconciliation_status IS NULL
    OR reconciliation_status IN (
      'pending',
      'verified',
      'unresolved'
    )
  );
  END IF;
END
$migration$;



-- SOURCE: 20261104_marketscout_evidence_hardening.sql



ALTER TABLE marketscout.payment_ledger
  ADD COLUMN IF NOT EXISTS token_address text,
  ADD COLUMN IF NOT EXISTS recipient_address text,
  ADD COLUMN IF NOT EXISTS authorization_amount_atomic bigint,
  ADD COLUMN IF NOT EXISTS valid_after bigint,
  ADD COLUMN IF NOT EXISTS valid_before bigint;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_evidence_complete_check'
      AND conrelid =
        'marketscout.payment_ledger'::regclass
  ) THEN
    ALTER TABLE marketscout.payment_ledger
  ADD CONSTRAINT payment_evidence_complete_check CHECK (
    (
      authorization_nonce IS NULL
      AND payer_address IS NULL
      AND network IS NULL
      AND token_address IS NULL
      AND recipient_address IS NULL
      AND authorization_amount_atomic IS NULL
      AND valid_after IS NULL
      AND valid_before IS NULL
    )
    OR
    (
      authorization_nonce IS NOT NULL
      AND payer_address IS NOT NULL
      AND network IS NOT NULL
      AND token_address IS NOT NULL
      AND recipient_address IS NOT NULL
      AND authorization_amount_atomic IS NOT NULL
      AND valid_after IS NOT NULL
      AND valid_before IS NOT NULL
    )
  );
  END IF;
END;
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_evidence_values_check'
      AND conrelid =
        'marketscout.payment_ledger'::regclass
  ) THEN
    ALTER TABLE marketscout.payment_ledger
  ADD CONSTRAINT payment_evidence_values_check CHECK (
    token_address IS NULL
    OR (
      token_address ~ '^0x[0-9a-fA-F]{40}$'
      AND recipient_address ~ '^0x[0-9a-fA-F]{40}$'
      AND authorization_amount_atomic = amount_atomic
      AND valid_after >= 0
      AND valid_before > valid_after
    )
  );
  END IF;
END;
$migration$;

DROP INDEX IF EXISTS marketscout.payment_ledger_authorization_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS payment_ledger_authorization_unique_idx
ON marketscout.payment_ledger (
  lower(network),
  lower(token_address),
  lower(payer_address),
  lower(authorization_nonce)
)
WHERE authorization_nonce IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_ledger_tx_hash_unique_idx
ON marketscout.payment_ledger (
  lower(network),
  lower(tx_hash)
)
WHERE tx_hash IS NOT NULL AND network IS NOT NULL;

CREATE OR REPLACE FUNCTION marketscout.protect_payment_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.authorization_nonce IS NOT NULL AND (
      NEW.authorization_nonce IS DISTINCT FROM OLD.authorization_nonce
      OR NEW.payer_address IS DISTINCT FROM OLD.payer_address
      OR NEW.network IS DISTINCT FROM OLD.network
      OR NEW.token_address IS DISTINCT FROM OLD.token_address
      OR NEW.recipient_address IS DISTINCT FROM OLD.recipient_address
      OR NEW.authorization_amount_atomic IS DISTINCT FROM OLD.authorization_amount_atomic
      OR NEW.valid_after IS DISTINCT FROM OLD.valid_after
      OR NEW.valid_before IS DISTINCT FROM OLD.valid_before
    ) THEN
      RAISE EXCEPTION 'Payment authorization evidence is immutable';
    END IF;

    IF OLD.tx_hash IS NOT NULL
       AND NEW.tx_hash IS DISTINCT FROM OLD.tx_hash THEN
      RAISE EXCEPTION 'Payment transaction hash is immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_evidence_immutable
ON marketscout.payment_ledger;

CREATE TRIGGER payment_evidence_immutable
BEFORE UPDATE ON marketscout.payment_ledger
FOR EACH ROW
EXECUTE FUNCTION marketscout.protect_payment_evidence();



-- SOURCE: 20261105_marketscout_atomic_mainnet_reservation_draft.sql


-- DRAFT ONLY. DO NOT APPLY TO PRODUCTION.
-- Atomic Celo Mainnet authorization reservation.
-- Local adversarial testing required before approval.


CREATE OR REPLACE FUNCTION
public.marketscout_reserve_mainnet_authorization(
  p_id uuid,
  p_payer text,
  p_nonce text,
  p_valid_after bigint,
  p_valid_before bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_used bigint;
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
  THEN
    RETURN false;
  END IF;

  -- Serialize budget checks across concurrent transactions.
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
    reconciliation_status
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
    'pending'
  );

  RETURN true;

EXCEPTION
  WHEN unique_violation OR check_violation THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION
public.marketscout_reserve_mainnet_authorization(
  uuid,text,text,bigint,bigint
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.marketscout_reserve_mainnet_authorization(
  uuid,text,text,bigint,bigint
)
TO service_role;



-- SOURCE: 20261105_marketscout_dual_network_settlement.sql


-- DUAL-NETWORK SETTLEMENT DRAFT.
-- NOT APPLIED TO PRODUCTION.
-- SQL does not independently verify blockchain transactions.
-- DRAFT ONLY. DO NOT APPLY TO PRODUCTION.
-- Application must independently verify on-chain evidence.
-- Restricted to service_role.


CREATE OR REPLACE FUNCTION public.marketscout_settle_verified_payment(
  p_id uuid,
  p_tx_hash text,
  p_payer text,
  p_nonce text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_row marketscout.payment_ledger%ROWTYPE;
BEGIN
  IF p_id IS NULL
     OR p_tx_hash IS NULL
     OR p_payer IS NULL
     OR p_nonce IS NULL
     OR p_tx_hash !~ '^0x[0-9a-fA-F]{64}$'
     OR p_payer !~ '^0x[0-9a-fA-F]{40}$'
     OR p_nonce !~ '^0x[0-9a-fA-F]{64}$'
  THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_row
  FROM marketscout.payment_ledger
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_row.status <> 'reserved'
     OR v_row.reconciliation_status <> 'pending'
     OR v_row.network NOT IN ('celo-sepolia', 'celo')
     OR v_row.authorization_nonce IS NULL
     OR lower(v_row.payer_address) IS DISTINCT FROM lower(p_payer)
     OR lower(v_row.authorization_nonce) IS DISTINCT FROM lower(p_nonce)
     OR v_row.tx_hash IS NOT NULL
  THEN
    RETURN false;
  END IF;

  UPDATE marketscout.payment_ledger
  SET
    tx_hash = lower(p_tx_hash),
    status = 'confirmed',
    reconciliation_status = 'verified',
    updated_at = now()
  WHERE id = p_id;

  RETURN FOUND;

EXCEPTION
  WHEN unique_violation OR check_violation THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION
public.marketscout_settle_verified_payment(
  uuid,text,text,text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.marketscout_settle_verified_payment(
  uuid,text,text,text
)
TO service_role;



-- SOURCE: 20261105_marketscout_recovery_lookup_draft.sql


-- MarketScout AI: Mainnet payment recovery lookup.
-- DRAFT ONLY. Do not apply to production without approval.

CREATE OR REPLACE FUNCTION public.marketscout_lookup_mainnet_payment(
  p_payer text,
  p_nonce text
)
RETURNS TABLE (
  reservation_id uuid,
  payment_status text,
  reconciliation_state text,
  transaction_hash text,
  amount_atomic bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_payer !~* '^0x[0-9a-f]{40}$'
     OR p_nonce !~* '^0x[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid recovery identity';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.status,
    l.reconciliation_status,
    l.tx_hash,
    l.amount_atomic
  FROM marketscout.payment_ledger AS l
  WHERE lower(l.network) = 'celo'
    AND lower(l.payer_address) = lower(p_payer)
    AND lower(l.authorization_nonce) = lower(p_nonce)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.marketscout_lookup_mainnet_payment(text,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.marketscout_lookup_mainnet_payment(text,text)
TO service_role;

COMMIT;
