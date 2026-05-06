-- KKME — Baltic Storage Index monthly snapshot table
-- Migration 002 · Phase 29 (KKME Baltic Storage Index — first public-facing Tier 1 product surface).
--
-- Stores per-country per-duration monthly index values in €/MW/month annualized
-- basis (Clean Horizon convention). One row per (month, country, duration,
-- computed_at). Append-only history table — the `baltic_storage_index_latest`
-- KV value at the worker resolves to the most recent computed_at across all
-- (month, country, duration) tuples.
--
-- Phase 29 ships LT/{2h,4h} canonical. LV, EE, and the 1h column are stubbed
-- with NULL value_eur_mw_month per the option-ε scope decision (per-country
-- data plumbing is Phase 29.1 follow-on; 1h SOC physics is a separate engine
-- extension). The schema accepts NULL `value_eur_mw_month` so coverage_pending
-- rows are persisted with a notes string explaining the deferral, preserving
-- audit-trail intent for when the gaps close.
--
-- Run on VPS PostgreSQL (database `kkme`):
--   psql ${KKME_DB_URL} -f /opt/kkme/scripts/sql/002_baltic_storage_index.sql

CREATE TABLE IF NOT EXISTS kkme_baltic_storage_index (
  id                     SERIAL      PRIMARY KEY,
  month                  TEXT        NOT NULL,                       -- 'YYYY-MM'
  country                TEXT        NOT NULL CHECK (country IN ('LT', 'LV', 'EE')),
  duration               TEXT        NOT NULL CHECK (duration IN ('1h', '2h', '4h')),
  value_eur_mw_month     NUMERIC,                                    -- NULL = coverage_pending; see notes
  computation_window     TEXT        NOT NULL,                       -- e.g. 'previous-month-final', 'mtd-trailing'
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_engine_version  TEXT        NOT NULL,                       -- 'v7.3' as of 2026-05-06
  coverage_status        TEXT        NOT NULL DEFAULT 'complete',    -- 'complete' | 'pending_phase_29_1' | 'pending_engine_1h_physics'
  notes                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_baltic_storage_index_month_country
  ON kkme_baltic_storage_index (month, country, duration, computed_at DESC);

COMMENT ON TABLE kkme_baltic_storage_index IS
  'KKME Baltic Storage Index — monthly per-country per-duration revenue benchmark. '
  'Phase 29 ships LT/{2h,4h} populated; LV, EE, and 1h slots persisted with '
  'value_eur_mw_month NULL + coverage_status set per option-ε scope decision. '
  'Append-only; baltic_storage_index.py populates daily.';
