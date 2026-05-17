-- Convert the observations table to range-partitioned by observed_at, one
-- partition per day. Hand-written because Drizzle does not emit
-- PARTITION BY. Architecture-v3.md §"The observation-log data model"
-- locks daily date partitioning as part of the data model from Phase 1.
--
-- This migration is idempotent at the per-partition level (the
-- create_observations_partition function uses CREATE TABLE IF NOT EXISTS),
-- but it is not safe to re-run on a database that already has a
-- partitioned observations table — Drizzle's migration tracker prevents
-- that by recording this migration's hash on first apply.

--> statement-breakpoint
-- The materialized view depends on observations.id (via the implicit SELECT *
-- column list captured at creation time). Drop it; migrate.ts re-creates it
-- after the migrations finish.
DROP MATERIALIZED VIEW IF EXISTS current_state CASCADE;

--> statement-breakpoint
ALTER TABLE observations RENAME TO observations_old;

--> statement-breakpoint
ALTER INDEX observations_pkey RENAME TO observations_old_pkey;

--> statement-breakpoint
ALTER INDEX observations_entity_attr_time_idx RENAME TO observations_old_entity_attr_time_idx;

--> statement-breakpoint
ALTER INDEX observations_source_record_time_idx RENAME TO observations_old_source_record_time_idx;

--> statement-breakpoint
ALTER INDEX observations_sync_run_idx RENAME TO observations_old_sync_run_idx;

--> statement-breakpoint
ALTER SEQUENCE observations_id_seq RENAME TO observations_old_id_seq;

--> statement-breakpoint
-- New partitioned parent. Same columns as the old table; the primary key
-- must include observed_at because Postgres requires the partition key in
-- any unique constraint on a partitioned table.
CREATE TABLE observations (
  id bigserial NOT NULL,
  observed_at timestamptz NOT NULL,
  source text NOT NULL,
  source_record_id text NOT NULL,
  entity_kind entity_kind NOT NULL,
  entity_id uuid NOT NULL,
  attribute text NOT NULL,
  value jsonb NOT NULL,
  sync_run_id uuid NOT NULL,
  CONSTRAINT observations_pkey PRIMARY KEY (observed_at, id)
) PARTITION BY RANGE (observed_at);

--> statement-breakpoint
-- Indexes on the partitioned parent. Postgres 11+ cascades to all partitions
-- (existing and future) automatically.
CREATE INDEX observations_entity_attr_time_idx
  ON observations (entity_id, attribute, observed_at DESC);

--> statement-breakpoint
CREATE INDEX observations_source_record_time_idx
  ON observations (source, source_record_id, observed_at DESC);

--> statement-breakpoint
CREATE INDEX observations_sync_run_idx ON observations (sync_run_id);

--> statement-breakpoint
-- Idempotent partition-creation helper. Called by:
--   - This migration, for the initial window.
--   - packages/db/src/roll-partitions.ts, daily, to keep the window rolling.
--   - migrate.ts, on every boot, belt-and-suspenders.
--
-- Naming: observations_YYYYMMDD. One day per partition (architecture-v3
-- "90 days hot" retention applies a per-day drop policy later).
CREATE OR REPLACE FUNCTION create_observations_partition(day date)
RETURNS void AS $$
DECLARE
  partition_name text;
  start_date date := day;
  end_date date := day + INTERVAL '1 day';
BEGIN
  partition_name := 'observations_' || to_char(day, 'YYYYMMDD');
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF observations FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
-- Initial window: 7 days back + today + 14 days forward. The roll-partitions
-- worker keeps the forward edge moving.
DO $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      CURRENT_DATE - INTERVAL '7 days',
      CURRENT_DATE + INTERVAL '14 days',
      INTERVAL '1 day'
    )::date
  LOOP
    PERFORM create_observations_partition(d);
  END LOOP;
END;
$$;

--> statement-breakpoint
-- Backfill: ensure a partition exists for every distinct day in the old
-- data, then copy the rows over. The DISTINCT subquery is cheap because
-- existing data sets are small at Phase 1 (the Phase 1 demo starts empty).
DO $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT DISTINCT date_trunc('day', observed_at)::date AS day
    FROM observations_old
    ORDER BY day
  LOOP
    PERFORM create_observations_partition(d);
  END LOOP;
END;
$$;

--> statement-breakpoint
INSERT INTO observations (
  id, observed_at, source, source_record_id, entity_kind, entity_id,
  attribute, value, sync_run_id
)
SELECT
  id, observed_at, source, source_record_id, entity_kind, entity_id,
  attribute, value, sync_run_id
FROM observations_old;

--> statement-breakpoint
-- Reset the new sequence past the highest id from the old data so future
-- inserts don't collide with backfilled rows.
SELECT setval(
  pg_get_serial_sequence('observations', 'id'),
  COALESCE((SELECT MAX(id) FROM observations), 0) + 1,
  false
);

--> statement-breakpoint
DROP TABLE observations_old;
