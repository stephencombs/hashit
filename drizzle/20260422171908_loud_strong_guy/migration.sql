CREATE TABLE "v2_messages" (
	"id" text PRIMARY KEY,
	"thread_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"parts" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v2_threads" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"source" text,
	"resume_offset" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"pinned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "v2_messages" ADD CONSTRAINT "v2_messages_thread_id_v2_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "v2_threads"("id");