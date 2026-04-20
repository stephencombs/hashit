CREATE TABLE "prompt_attachments" (
	"id" text PRIMARY KEY,
	"blob_name" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
