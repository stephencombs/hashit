CREATE TABLE "v2_thread_runs" (
	"thread_id" text PRIMARY KEY,
	"run_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "v2_thread_runs" ADD CONSTRAINT "v2_thread_runs_thread_id_v2_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "v2_threads"("id");