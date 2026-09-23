import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

export const caseStatus = pgEnum('case_status', ['draft', 'in_review', 'analysed', 'decided']);
export const documentType = pgEnum('document_type', ['modelo_303', 'annual_accounts']);
export const extractionStatus = pgEnum('extraction_status', ['pending', 'extracting', 'needs_review', 'confirmed', 'failed']);
export const fieldStatus = pgEnum('field_status', ['proposed', 'confirmed', 'corrected']);
export const recommendation = pgEnum('recommendation', ['APPROVE', 'REFER', 'DECLINE']);

export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  borrowerName: text('borrower_name').notNull(),
  nif: text('nif').notNull(),
  requestedAmount: numeric('requested_amount', { precision: 14, scale: 2 }),
  status: caseStatus('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  type: documentType('type').notNull(),
  // "2025-Q3" for Modelo 303, "2025" for annual accounts.
  period: text('period').notNull(),
  filename: text('filename').notNull(),
  blobUrl: text('blob_url').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  extractionStatus: extractionStatus('extraction_status').notNull().default('pending'),
  extractionError: text('extraction_error'),
}, t => [index('documents_case_idx').on(t.caseId)]);

export const fields = pgTable('fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  // Decimal strings (or text for identifiers such as the NIF); null when the model found nothing.
  extractedValue: text('extracted_value'),
  confirmedValue: text('confirmed_value'),
  page: integer('page'),
  quote: text('quote'),
  status: fieldStatus('status').notNull().default('proposed'),
  correctionReason: text('correction_reason'),
}, t => [index('fields_document_idx').on(t.documentId)]);

export const analyses = pgTable('analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  policyVersion: text('policy_version').notNull(),
  inputs: jsonb('inputs').notNull(),
  metrics: jsonb('metrics').notNull(),
  checks: jsonb('checks').notNull(),
  ruleResults: jsonb('rule_results').notNull(),
  recommendation: recommendation('recommendation').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('analyses_case_idx').on(t.caseId)]);

export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // One decision per analysis; once written, the analysis and decision are read-only.
  analysisId: uuid('analysis_id').notNull().unique().references(() => analyses.id, { onDelete: 'cascade' }),
  decision: recommendation('decision').notNull(),
  isOverride: boolean('is_override').notNull(),
  reason: text('reason').notNull(),
  decidedBy: text('decided_by').notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
});

// Append-only case timeline, shown in the memo. Never updated or deleted by the app.
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('events_case_idx').on(t.caseId, t.createdAt)]);

export type Case = typeof cases.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type EventRow = typeof events.$inferSelect;
