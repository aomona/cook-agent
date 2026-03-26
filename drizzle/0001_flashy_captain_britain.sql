CREATE TYPE "public"."recipe_processing_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD COLUMN "processing_status" "recipe_processing_status" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD COLUMN "processing_error" text;
