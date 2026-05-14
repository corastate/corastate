CREATE TYPE "public"."entity_kind" AS ENUM('device', 'identity', 'agent');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "observations" (
	"id" bigserial NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"source_record_id" text NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"attribute" text NOT NULL,
	"value" jsonb NOT NULL,
	"sync_run_id" uuid NOT NULL,
	CONSTRAINT "observations_pkey" PRIMARY KEY("observed_at","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" text NOT NULL,
	"connector_version" text NOT NULL,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"observation_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"context" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entities_kind_idx" ON "entities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entities_updated_at_idx" ON "entities" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observations_entity_attr_time_idx" ON "observations" USING btree ("entity_id","attribute","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observations_source_record_time_idx" ON "observations" USING btree ("source","source_record_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observations_sync_run_idx" ON "observations" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_runs_connector_started_idx" ON "sync_runs" USING btree ("connector_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_runs_status_idx" ON "sync_runs" USING btree ("status");