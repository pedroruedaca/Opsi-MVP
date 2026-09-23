# CLAUDE.md

## Product

Opsi MVP helps credit analysts at Spanish alternative lenders turn a borrower's financial documents into a traceable credit memo. The whole product is four steps:

1. **Ingest:** upload Modelo 303 quarterly VAT returns and annual accounts to a case.
2. **Parse:** AI extracts fixed fields, each with its page and literal quote. The analyst confirms or corrects every field in a side-by-side view.
3. **Analyse:** deterministic code computes metrics, consistency checks and policy rules, and shows the numbers.
4. **Memo:** a printable credit memo with the recommendation, the analyst's decision and a citation for every figure.

**Every new feature must serve one of these four steps. If it doesn't, don't build it.**

The full spec and phase plan is `docs/underwriting-mvp-prompt.md` in `pedroruedaca/Opsi`. **Phase 1 (ingest) is done. Phase 2 (parse and review) is next.**

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
npm run samples               # regenerate samples/*.pdf after changing scripts/sample-data.ts
npm run db:generate           # new migration after a schema change
```

## Honesty

- Say which results come from real extraction and which from cached fixtures.
- The sample PDFs are synthetic and don't follow the official 303 layout. Validate extraction on real 303s before calling it working.
- Label policy thresholds as illustrative until a lender provides real ones.
