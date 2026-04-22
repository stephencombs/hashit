ALTER TABLE "canvas_edges" DROP CONSTRAINT "canvas_edges_canvas_id_canvases_id_fkey";--> statement-breakpoint
ALTER TABLE "canvas_edges" DROP CONSTRAINT "canvas_edges_source_node_id_canvas_nodes_id_fkey";--> statement-breakpoint
ALTER TABLE "canvas_edges" DROP CONSTRAINT "canvas_edges_target_node_id_canvas_nodes_id_fkey";--> statement-breakpoint
ALTER TABLE "canvas_nodes" DROP CONSTRAINT "canvas_nodes_canvas_id_canvases_id_fkey";--> statement-breakpoint
ALTER TABLE "node_versions" DROP CONSTRAINT "node_versions_node_id_canvas_nodes_id_fkey";--> statement-breakpoint
DROP TABLE "canvas_edges";--> statement-breakpoint
DROP TABLE "canvas_nodes";--> statement-breakpoint
DROP TABLE "canvases";--> statement-breakpoint
DROP TABLE "node_versions";--> statement-breakpoint
DROP TABLE "prompt_attachments";--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "resume_offset" text;