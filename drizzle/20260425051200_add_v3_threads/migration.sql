CREATE TABLE "v3_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"pinned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "v3_threads_active_updated_at_idx" ON "v3_threads" USING btree ("updated_at","created_at","id") WHERE "v3_threads"."deleted_at" IS NULL;
