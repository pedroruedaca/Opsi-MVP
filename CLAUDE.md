# CLAUDE.md

## Product

Opsi MVP helps credit analysts at Spanish alternative lenders turn a borrower's financial documents into a traceable credit memo. The whole product is four steps:

1. **Ingest:** upload Modelo 303 quarterly VAT returns and annual accounts to a case.
2. **Parse:** AI extracts fixed fields, each with its page and literal quote. The analyst confirms or corrects every field in a side-by-side view.
3. **Analyse:** deterministic code computes metrics, consistency checks and policy rules, and shows the numbers.
4. **Memo:** a printable credit memo with the recommendation, the analyst's decision and a citation for every figure.

**Every new feature must serve one of these four steps. If it doesn't, don't build it.**

The full spec and phase plan is `docs/underwriting-mvp-prompt.md` in `pedroruedaca/Opsi`. **Phases 1 (ingest) and 2 (parse and review) are done. Phase 3 (analyse) is next.**

## Non-negotiable principles

- **AI proposes, people verify, code decides.** The model only extracts values. It never computes metrics, applies rules or recommends. Analysis uses confirmed fields only.
- **Everything is traceable.** Fields keep their document, page and quote. Metrics keep their formula and input field IDs.
- **A human records the decision.** The analyst records it with a reason. A decision that differs from the recommendation is marked as an override.
- **Missing isn't failing.** An unavailable input makes a rule *missing*, which sends the case to REFER.
- **No invented numbers.** Unclear values stay empty. Take the Modelo 303 casilla numbers from the official AEAT design, never from memory.
- **Money is decimal.** Amounts are `numeric` in Postgres and decimal strings in code. Use a decimal library for arithmetic (Phase 3), never floats.

## Out of scope

Multi-tenancy, roles, borrower portals, chat, workflow editors, billing, a separate backend, bank data, KYC/AML, monitoring, and automated loan sizing.

## Stack and layout

- **Framework:** Next.js 16 App Router, TypeScript strict, Tailwind v4. There's no separate backend.
  - Next 16 uses `src/proxy.ts`, not `middleware.ts`.
  - `params` and `searchParams` are Promises.
- **Database:** Postgres with Drizzle.
  - Schema: `src/db/schema.ts`, with all six tables already defined.
  - Migrations: `drizzle/`.
  - **Never edit a committed migration.** Change the schema, then run `npm run db:generate`.
- **Auth:** one shared `DEMO_PASSWORD` and a signed cookie (`src/lib/auth.ts`, `src/proxy.ts`). API routes return 401 and pages redirect to `/login`.
- **File storage:** `src/lib/storage.ts`. It uses a private Vercel Blob store when `BLOB_READ_WRITE_TOKEN` is set, otherwise `.data/uploads/`. Files are only served through `/api/documents/[id]/file`.
- **Cases:** `src/lib/cases.ts` holds the case and document operations. Every mutation writes an `events` row in the same transaction. Events are append-only.
- **Upload validation:** `src/lib/documents.ts`.
  - The content must start with `%PDF-`. The browser MIME type isn't trusted.
  - Files are limited to 10 MB, and empty files are rejected.
  - The period format is `YYYY-Q1…Q4` for a 303 and `YYYY` for accounts.
  - The same SHA-256 can't be uploaded twice to one case.
- **Sample data:**
  - Figures: `scripts/sample-data.ts`, a synthetic borrower, Talleres Ribera S.L.
  - PDFs: `scripts/generate-samples.ts` builds `samples/*.pdf` with a small PDF writer (`scripts/lib/pdf.ts`). The PDFs contain real text, so pdf.js can find quotes in them.
- **Extraction:** `src/lib/extraction.ts`.
  - Calls `client.beta.messages.parse` with structured output (`betaZodOutputFormat`). The model is `claude-opus-5`, overridable with `ANTHROPIC_MODEL`, with server-side `fallbacks: 'default'`.
  - `validateExtraction` is strict. An unknown or duplicate key, an unparsable value, a missing page or quote, or `isExpectedDocument: false` fails the **whole** document. Never accept a partial result.
  - Fields are defined in `src/lib/fields.ts`, including the 303 casilla numbers. Annual accounts only extract lines that are printed. Total debt, EBITDA (when not stated) and margins are derived in Phase 3.
  - `canonicalValue` normalises amounts to decimal strings such as `-760000.00`.
- **Pipeline:** `src/lib/review.ts`.
  - `runExtraction` claims the document atomically: `pending`/`failed` → `extracting`, with a 5-minute stale takeover.
  - It uses the cached fixture when the SHA-256 matches a sample, otherwise Claude.
  - It creates one `fields` row per defined field, including fields that weren't found, then sets `needs_review`.
  - It runs through `after()` in the upload route and in `POST /api/documents/[id]/extract` (retry).
- **Review:** `reviewField` supports `confirm`, `correct` (value and reason required) and `clear` (a reason is required if a value had been proposed).
  - A field is reviewed when `reviewed_at` is set. A document is `confirmed` when every field is reviewed.
  - A cleared field has `confirmed_value = null`.
  - Fields are read-only once the case is `analysed`/`decided`.
- **Cached extractions:** `src/fixtures/extractions.ts` is generated by `npm run samples`. It's built from the sample data, not recorded from the API. The UI labels it "Extracción en caché (muestra)".
- **Viewer:** `src/components/PdfViewer.tsx` uses the pdf.js **legacy** build, because the modern build needs `Map.getOrInsertComputed`. The worker is copied to `public/` by `predev`/`prebuild`.
  - It renders canvases and positions the highlight boxes from the text items.
  - `src/lib/quote-locator.ts` finds the quote, ignoring whitespace, case and dashes. It never matches partially or fuzzily, and it reports when a quote is found on a different page than stated.
- **Language:** the UI is in Spanish and the code is in English.

## Commands

```bash
docker compose up -d          # local Postgres (or any Postgres; set DATABASE_URL)
cp .env.example .env          # set DEMO_PASSWORD and SESSION_SECRET (32+ chars)
npm install
npm run db:migrate            # apply drizzle/ migrations
npm run db:seed               # demo case from samples/ (idempotent)
npm run dev
npm test                      # Vitest unit tests
TEST_DATABASE_URL=postgres://opsi:opsi@localhost:5432/opsi_test npm test   # also runs the Postgres integration test
npm run typecheck && npm run build
npm run e2e                   # Playwright against the production build on :3100 (needs a migrated DB; PLAYWRIGHT_CHROMIUM_PATH optional)
npm run samples               # regenerate samples/*.pdf after changing scripts/sample-data.ts
npm run db:generate           # new migration after a schema change
```

## Honesty

- Say which results come from real extraction and which from cached fixtures.
- The sample PDFs are synthetic and don't follow the official 303 layout. Validate extraction on real 303s before calling it working.
- Live Claude extraction is covered only by unit tests with a mocked client. It hasn't been run against the real API yet.
- The casilla numbers come from secondary sources (see `src/lib/fields.ts`), because AEAT wasn't reachable. Orden HAC/27/2026 changed the 303 design, so verify the numbers before a pilot (`CASILLAS_VERIFIED_AGAINST_AEAT = false`).
- Label policy thresholds as illustrative until a lender provides real ones.
