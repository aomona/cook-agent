CREATE TYPE "public"."plan_change_reason" AS ENUM('initial', 'user_edit', 'runtime_replan');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'ready', 'archived');--> statement-breakpoint
CREATE TYPE "public"."recipe_source_type" AS ENUM('url', 'manual');--> statement-breakpoint
CREATE TYPE "public"."session_event_type" AS ENUM('progress', 'delay', 'mistake', 'ingredient_shortage', 'user_request', 'replan_applied', 'timer');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('not_started', 'active', 'paused', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."timer_status" AS ENUM('running', 'paused', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "cooking_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "session_status" DEFAULT 'not_started' NOT NULL,
	"current_step_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_recipe_sources" (
	"plan_id" uuid NOT NULL,
	"recipe_source_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_recipe_sources_plan_id_recipe_source_id_pk" PRIMARY KEY("plan_id","recipe_source_id")
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"parent_version_id" uuid,
	"change_reason" "plan_change_reason" NOT NULL,
	"change_summary" text,
	"plan_json" jsonb NOT NULL,
	"patch_from_parent" jsonb,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"requested_servings" integer,
	"active_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_url" text,
	"source_type" "recipe_source_type" DEFAULT 'url' NOT NULL,
	"title" text,
	"description" text,
	"servings_text" text,
	"raw_content" jsonb NOT NULL,
	"normalized_recipe" jsonb,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"event_type" "session_event_type" NOT NULL,
	"step_id" text,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_timers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"label" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"paused_remaining_seconds" integer,
	"status" timer_status DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cooking_sessions" ADD CONSTRAINT "cooking_sessions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooking_sessions" ADD CONSTRAINT "cooking_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooking_sessions" ADD CONSTRAINT "cooking_sessions_plan_version_same_plan_fk" FOREIGN KEY ("plan_id","plan_version_id") REFERENCES "public"."plan_versions"("plan_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD CONSTRAINT "plan_recipe_sources_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD CONSTRAINT "plan_recipe_sources_recipe_source_id_recipe_sources_id_fk" FOREIGN KEY ("recipe_source_id") REFERENCES "public"."recipe_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_parent_same_plan_fk" FOREIGN KEY ("plan_id","parent_version_id") REFERENCES "public"."plan_versions"("plan_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_active_version_same_plan_fk" FOREIGN KEY ("id","active_version_id") REFERENCES "public"."plan_versions"("plan_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD CONSTRAINT "recipe_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_cooking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cooking_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_timers" ADD CONSTRAINT "session_timers_session_id_cooking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cooking_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cooking_sessions_user_id_status_updated_at_idx" ON "cooking_sessions" USING btree ("user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "cooking_sessions_plan_id_created_at_idx" ON "cooking_sessions" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "plan_recipe_sources_plan_id_sort_order_idx" ON "plan_recipe_sources" USING btree ("plan_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_plan_id_id_idx" ON "plan_versions" USING btree ("plan_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_plan_id_version_number_idx" ON "plan_versions" USING btree ("plan_id","version_number");--> statement-breakpoint
CREATE INDEX "plan_versions_plan_id_created_at_idx" ON "plan_versions" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "plans_user_id_updated_at_idx" ON "plans" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "plans_active_version_id_idx" ON "plans" USING btree ("active_version_id");--> statement-breakpoint
CREATE INDEX "recipe_sources_user_id_created_at_idx" ON "recipe_sources" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "recipe_sources_source_url_idx" ON "recipe_sources" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "session_events_session_id_occurred_at_idx" ON "session_events" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "session_events_event_type_idx" ON "session_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "session_timers_session_id_status_idx" ON "session_timers" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "session_timers_session_id_step_id_idx" ON "session_timers" USING btree ("session_id","step_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
