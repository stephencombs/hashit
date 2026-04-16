CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"spec" jsonb,
	"thread_id" text,
	"message_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" text PRIMARY KEY,
	"automation_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"cron_expression" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "canvas_edges" (
	"id" text PRIMARY KEY,
	"canvas_id" text NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_nodes" (
	"id" text PRIMARY KEY,
	"canvas_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"content" jsonb,
	"position_x" double precision DEFAULT 0 NOT NULL,
	"position_y" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvases" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"pinned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dashboard_snapshots" (
	"id" text PRIMARY KEY,
	"persona" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"recipes" jsonb,
	"widgets" jsonb,
	"previous_widget_ids" jsonb,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY,
	"thread_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"parts" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_versions" (
	"id" text PRIMARY KEY,
	"node_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"content" jsonb,
	"source" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"pinned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_thread_id_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id");--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id");--> statement-breakpoint
ALTER TABLE "canvas_edges" ADD CONSTRAINT "canvas_edges_canvas_id_canvases_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "canvases"("id");--> statement-breakpoint
ALTER TABLE "canvas_edges" ADD CONSTRAINT "canvas_edges_source_node_id_canvas_nodes_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "canvas_nodes"("id");--> statement-breakpoint
ALTER TABLE "canvas_edges" ADD CONSTRAINT "canvas_edges_target_node_id_canvas_nodes_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "canvas_nodes"("id");--> statement-breakpoint
ALTER TABLE "canvas_nodes" ADD CONSTRAINT "canvas_nodes_canvas_id_canvases_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "canvases"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id");--> statement-breakpoint
ALTER TABLE "node_versions" ADD CONSTRAINT "node_versions_node_id_canvas_nodes_id_fkey" FOREIGN KEY ("node_id") REFERENCES "canvas_nodes"("id");