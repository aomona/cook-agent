DO $$
BEGIN
	CREATE TYPE "public"."generation_status" AS ENUM('queued', 'fetching', 'extracting', 'planning', 'ready', 'failed');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "cooking_sessions" ADD COLUMN IF NOT EXISTS "generation_status" "generation_status";--> statement-breakpoint
UPDATE "cooking_sessions" SET "generation_status" = 'ready' WHERE "generation_status" IS NULL;--> statement-breakpoint
ALTER TABLE "cooking_sessions" ALTER COLUMN "generation_status" SET DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE "cooking_sessions" ALTER COLUMN "generation_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cooking_sessions" ADD COLUMN IF NOT EXISTS "generation_error" text;--> statement-breakpoint
ALTER TABLE "cooking_sessions" ADD COLUMN IF NOT EXISTS "kitchen_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint