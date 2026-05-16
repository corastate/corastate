CREATE TYPE "public"."credential_action" AS ENUM('encrypt', 'decrypt', 'rotate', 'mark_dead');--> statement-breakpoint
CREATE TYPE "public"."entity_kind" AS ENUM('device', 'identity', 'agent');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credential_access_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"credential_id" uuid,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"sync_run_id" uuid,
	"action" "credential_action" NOT NULL,
	"succeeded" boolean NOT NULL,
	"error_message" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"nonce" "bytea" NOT NULL,
	"wrapped_data_key" "bytea" NOT NULL,
	"wrapped_data_key_nonce" "bytea" NOT NULL,
	"key_version_id" integer NOT NULL,
	"aad" jsonb NOT NULL,
	"dead" boolean DEFAULT false NOT NULL,
	"oauth_refresh_ciphertext" "bytea",
	"oauth_refresh_nonce" "bytea",
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "key_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone
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
CREATE INDEX IF NOT EXISTS "credential_access_audit_credential_time_idx" ON "credential_access_audit" USING btree ("credential_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credential_access_audit_source_time_idx" ON "credential_access_audit" USING btree ("source_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credentials_source_name_unique" ON "credentials" USING btree ("source_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credentials_key_version_idx" ON "credentials" USING btree ("key_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entities_kind_idx" ON "entities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entities_updated_at_idx" ON "entities" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "key_versions_key_id_unique" ON "key_versions" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "key_versions_is_current_idx" ON "key_versions" USING btree ("is_current");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observations_entity_attr_time_idx" ON "observations" USING btree ("entity_id","attribute","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observations_source_record_time_idx" ON "observations" USING btree ("source","source_record_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observations_sync_run_idx" ON "observations" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_runs_connector_started_idx" ON "sync_runs" USING btree ("connector_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_runs_status_idx" ON "sync_runs" USING btree ("status");