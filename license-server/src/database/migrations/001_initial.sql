-- PhantomTweaks License Server - Initial Migration
-- Run against PostgreSQL (Supabase)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- LICENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS licenses (
  id              SERIAL PRIMARY KEY,
  license_key     VARCHAR(255) NOT NULL UNIQUE,
  product         VARCHAR(100) NOT NULL DEFAULT 'phantontweaks',
  status          VARCHAR(20)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','expired','revoked','suspended')),

  -- SellAuth link
  sellauth_order_id    VARCHAR(255),
  sellauth_customer_id VARCHAR(255),
  sellauth_customer_email VARCHAR(255),

  -- Activation
  hwid                VARCHAR(255),
  activation_count    INTEGER NOT NULL DEFAULT 0,
  max_activations     INTEGER NOT NULL DEFAULT 1,

  -- Expiry
  license_type        VARCHAR(20) NOT NULL DEFAULT 'lifetime'
                        CHECK (license_type IN ('lifetime','30d','90d','1y','custom')),
  expires_at          TIMESTAMPTZ,
  custom_expires_at   TIMESTAMPTZ,

  -- Metadata
  last_validation     TIMESTAMPTZ,
  last_ip             VARCHAR(45),
  last_version        VARCHAR(50),
  offline_grace_days  INTEGER NOT NULL DEFAULT 7,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_key       ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status     ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_hwid       ON licenses(hwid);
CREATE INDEX IF NOT EXISTS idx_licenses_order      ON licenses(sellauth_order_id);
CREATE INDEX IF NOT EXISTS idx_licenses_customer   ON licenses(sellauth_customer_id);

-- ============================================================
-- SESSIONS (temporary tokens after activation)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id              SERIAL PRIMARY KEY,
  license_id      INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  token           VARCHAR(512) NOT NULL UNIQUE,
  hwid            VARCHAR(255) NOT NULL,
  ip              VARCHAR(45),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  last_validated  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_token    ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_license  ON sessions(license_id);

-- ============================================================
-- ADMIN USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(100) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id              SERIAL PRIMARY KEY,
  license_key     VARCHAR(255),
  action          VARCHAR(50) NOT NULL,
  details         TEXT,
  ip              VARCHAR(45),
  hwid            VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_key ON activity_log(license_key);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_log(created_at DESC);
