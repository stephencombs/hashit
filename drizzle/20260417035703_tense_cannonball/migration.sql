CREATE TABLE "ai_events" (
	"id" text PRIMARY KEY,
	"request_id" text,
	"stream_id" text,
	"message_id" text,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_requests" (
	"request_id" text PRIMARY KEY,
	"stream_id" text NOT NULL,
	"provider" text,
	"model" text,
	"status" text NOT NULL,
	"finish_reason" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"message_count" integer,
	"has_tools" boolean,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"thread_id" text,
	"conversation_id" text,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "ai_events_request_id_ts_idx" ON "ai_events" ("request_id","timestamp");--> statement-breakpoint
CREATE INDEX "ai_events_timestamp_idx" ON "ai_events" ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_requests_started_at_idx" ON "ai_requests" ("started_at" DESC NULLS LAST);