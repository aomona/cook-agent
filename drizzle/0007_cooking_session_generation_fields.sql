DO $$
BEGIN
	CREATE TYPE "public"."generation_status" AS ENUM('queued', 'fetching', 'extracting', 'planning', 'ready', 'failed');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "cooking_sessions" ADD COLUMN IF NOT EXISTS "generation_status" "generation_status" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "cooking_sessions" ADD COLUMN IF NOT EXISTS "generation_error" text;--> statement-breakpoint
ALTER TABLE "cooking_sessions" ADD COLUMN IF NOT EXISTS "kitchen_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
