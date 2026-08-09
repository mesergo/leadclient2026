-- Schema additions made during the section-by-section refinement.
-- Idempotent (MariaDB 10.0.2+ supports ADD COLUMN IF NOT EXISTS).
-- Already included in db/schema.sql — run this only against an existing DB
-- that was created from an earlier schema version.
--
-- Apply:  mysql -u <user> -p <db> < db/migrations/2026-session-additions.sql

-- ---- channels (services): channel-edit page fields ----
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS service_ref           VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS export_webhook_url    VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS line_type             VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS close_hours_audio_url VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS close_hours_config    TEXT NULL;   -- JSON {type,ring_seconds,numbers[]}

-- ---- virtual numbers: multi-target redirect config ----
ALTER TABLE phone_numbers
  ADD COLUMN IF NOT EXISTS redirect_config TEXT NULL;         -- JSON {type,ring_seconds,numbers[]}

-- ---- users: profile suspension + restrictions ----
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_until DATETIME NULL,
  ADD COLUMN IF NOT EXISTS restrictions    TEXT NULL;         -- JSON {login_hours,login_source}

-- ---- translations: namespace (file) grouping ----
ALTER TABLE translation_strings
  ADD COLUMN IF NOT EXISTS namespace VARCHAR(60) NULL,
  ADD INDEX IF NOT EXISTS idx_trans_ns (lang_slug, namespace);

-- ---- billing: per-lead price ----
ALTER TABLE billing_defaults
  ADD COLUMN IF NOT EXISTS lead_price FLOAT NULL;

-- ---- billing: package display / marketing fields ----
ALTER TABLE payment_packages
  ADD COLUMN IF NOT EXISTS name           VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS subtitle       VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS original_price FLOAT NULL,
  ADD COLUMN IF NOT EXISTS setup_fee      FLOAT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_popular     TINYINT(1) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS companies      INT NULL,
  ADD COLUMN IF NOT EXISTS features       TEXT NULL,          -- JSON array of feature strings
  ADD COLUMN IF NOT EXISTS sort_order     INT NULL DEFAULT 0;
