CREATE TYPE "public"."recipe_adjustment_status" AS ENUM('idle', 'needs_base_servings', 'adjusting', 'completed', 'action_required');--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD COLUMN "base_servings_override" integer;--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD COLUMN "adjusted_for_servings" integer;--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD COLUMN "adjusted_recipe" jsonb;--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD COLUMN "adjustment_status" "recipe_adjustment_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD COLUMN "adjustment_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD COLUMN "adjustment_error" text;--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD COLUMN "step_changes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "plan_recipe_sources" ADD COLUMN "adjusted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "plan_recipe_sources_adjustment_status_idx" ON "plan_recipe_sources" USING btree ("adjustment_status");