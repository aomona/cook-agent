CREATE TABLE "user_planning_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"equipment" jsonb NOT NULL,
	"constraints" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_planning_settings" ADD CONSTRAINT "user_planning_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_planning_settings_updated_at_idx" ON "user_planning_settings" USING btree ("updated_at");