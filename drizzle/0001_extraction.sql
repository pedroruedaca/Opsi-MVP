ALTER TABLE "documents" ADD COLUMN "extraction_source" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extraction_model" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extraction_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fields" ADD COLUMN "reviewed_at" timestamp with time zone;