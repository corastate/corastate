-- Sources: per-install configured connectors. A source binds a connector id
-- (e.g. 'okta') to its baseUrl + per-install config, and is the join target
-- for credentials and sync_runs. Phase 1 Week 2 introduces this; see
-- phase-1-sprint-plan-v3.md §"Week 2".

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connector_id" text NOT NULL,
  "display_name" text NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sources_connector_id_idx" ON "sources" ("connector_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sources_active_idx" ON "sources" ("active");

--> statement-breakpoint
-- The sync_runs row carries the configured source it ran against. Nullable
-- because pre-Week-2 runs (if any) wouldn't have one; new rows always set it.
ALTER TABLE "sync_runs" ADD COLUMN IF NOT EXISTS "source_id" uuid;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_runs_source_id_idx"
  ON "sync_runs" ("source_id", "started_at" DESC);
