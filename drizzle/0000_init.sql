CREATE TYPE "public"."case_status" AS ENUM('draft', 'in_review', 'analysed', 'decided');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('modelo_303', 'annual_accounts');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'extracting', 'needs_review', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."field_status" AS ENUM('proposed', 'confirmed', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."recommendation" AS ENUM('APPROVE', 'REFER', 'DECLINE');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"checks" jsonb NOT NULL,
	"rule_results" jsonb NOT NULL,
	"recommendation" "recommendation" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"borrower_name" text NOT NULL,
	"nif" text NOT NULL,
	"requested_amount" numeric(14, 2),
	"status" "case_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"decision" "recommendation" NOT NULL,
	"is_override" boolean NOT NULL,
	"reason" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_analysis_id_unique" UNIQUE("analysis_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"type" "document_type" NOT NULL,
	"period" text NOT NULL,
	"filename" text NOT NULL,
	"blob_url" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extraction_status" "extraction_status" DEFAULT 'pending' NOT NULL,
	"extraction_error" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"key" text NOT NULL,
	"extracted_value" text,
	"confirmed_value" text,
	"page" integer,
	"quote" text,
	"status" "field_status" DEFAULT 'proposed' NOT NULL,
	"correction_reason" text
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_case_idx" ON "analyses" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "documents_case_idx" ON "documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "events_case_idx" ON "events" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "fields_document_idx" ON "fields" USING btree ("document_id");