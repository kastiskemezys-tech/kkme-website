-- KKME — ENTSO-E A68 installed-capacity snapshot table
-- Migration 001 · Phase 12.10 (data discrepancy hot-fix bundle).
--
-- Stores raw + parsed snapshots of ENTSO-E Transparency Platform
-- "Installed Capacity per Production Type" (documentType=A68) per Baltic
-- bidding zone. Production type B25 = battery storage.
--
-- One row per (country, production_type, fetched_at). The snapshot table is
-- append-only; the `installed_storage_*_mw_live` field surfaced at the
-- worker `/s4` endpoint resolves to the latest row per country (idx_entsoe_country_fetched).
--
-- Run on VPS PostgreSQL (database `kkme`):
--   psql ${KKME_DB_URL} -f /opt/kkme/scripts/sql/001_entsoe_installed_capacity.sql

CREATE TABLE IF NOT EXISTS entsoe_installed_capacity (
  id              SERIAL      PRIMARY KEY,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  country         TEXT        NOT NULL,                    -- 'LT' | 'LV' | 'EE'
  production_type TEXT        NOT NULL,                    -- 'B25' for battery storage
  installed_mw    NUMERIC,                                 -- nullable: A68 may omit B25 entirely
  raw_xml         TEXT,                                    -- full upstream A68 XML for audit trail
  source_url      TEXT,                                    -- transparency.entsoe.eu reproducible URL
  parse_warnings  JSONB                                    -- e.g. ["B25 missing in response", "schema drift on Period"]
);

CREATE INDEX IF NOT EXISTS idx_entsoe_country_fetched
  ON entsoe_installed_capacity (country, fetched_at DESC);

COMMENT ON TABLE entsoe_installed_capacity IS
  'ENTSO-E A68 daily installed-capacity snapshots per Baltic BZN. '
  'Phase 12.10 introduced for live-fetch of installed_storage_<country>_mw_live. '
  'Append-only; latest row per country surfaced by fetch_entsoe_installed_capacity.py.';
