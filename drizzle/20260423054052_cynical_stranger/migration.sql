CREATE TABLE "v2_thread_activity_events" (
	"id" serial PRIMARY KEY,
	"thread_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "v2_thread_activity_events_id_idx" ON "v2_thread_activity_events" ("id");--> statement-breakpoint
ALTER TABLE "v2_thread_activity_events" ADD CONSTRAINT "v2_thread_activity_events_thread_id_v2_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "v2_threads"("id");