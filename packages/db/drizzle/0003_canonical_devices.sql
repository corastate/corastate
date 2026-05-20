-- Cross-source canonical devices. The correlation engine (Week 3) reads
-- observations grouped by entity_id, applies the configured match rules to
-- collapse per-source views into one row per physical device, and upserts
-- the result here. `match_key` is the natural key (normalized serial, or a
-- synthetic key for no-serial devices) so the upsert is idempotent across
-- engine runs. See architecture-v3.md §"Correlation rules" and
-- phase-1-sprint-plan-v3.md §"Week 3".

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canonical_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_key" text NOT NULL,
  "hostname" text,
  "serial_number" text,
  "hardware_uuid" text,
  "azure_ad_device_id" text,
  "mac_addresses" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "os_version" text,
  "disk_encryption" boolean,
  "mdm_enrolled" boolean,
  "agent_running" boolean,
  "owner_email" text,
  "last_check_in" timestamp with time zone,
  "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "missing_from" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source_last_seen" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_entity_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canonical_devices_match_key_unique"
  ON "canonical_devices" ("match_key");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canonical_devices_updated_at_idx"
  ON "canonical_devices" ("updated_at" DESC, "id" DESC);

--> statement-breakpoint
-- Functional indexes for the /v1/devices fuzzy filter on hostname / owner_email.
-- LIKE %term% can't use these, but lower() preserves equality joins downstream
-- and Postgres still benefits when the fuzzy term is anchored or short.
CREATE INDEX IF NOT EXISTS "canonical_devices_hostname_lower_idx"
  ON "canonical_devices" (lower("hostname"));

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canonical_devices_owner_email_lower_idx"
  ON "canonical_devices" (lower("owner_email"));
