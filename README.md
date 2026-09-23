# Opsi MVP

Opsi MVP turns a borrower's Spanish financial documents into a traceable credit memo, in four steps:

1. **Ingest:** upload the documents to a case.
2. **Parse:** AI proposes field values, and the analyst verifies them.
3. **Analyse:** deterministic rules evaluate the confirmed figures.
4. **Memo:** a printable credit memo.

See `CLAUDE.md` for the principles, architecture and commands.

## Quick start

```bash
docker compose up -d
cp .env.example .env   # set DEMO_PASSWORD and SESSION_SECRET
npm install
npm run db:migrate && npm run db:seed
npm run dev            # http://localhost:3000, log in with DEMO_PASSWORD
```

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Skeleton, demo login, cases, PDF upload with SHA-256, statuses, samples and seed | Done |
| 2 | Extraction (Claude) and the side-by-side review with quote highlighting | Done |
| 3 | Metrics, consistency checks, versioned policy, recommendation | Done |
| 4 | Credit memo, decision, print layout, end-to-end test | Next |

### Phase 3 notes

- **Running it:** the **Análisis** tab unlocks once every document is reviewed. It runs a deterministic calculation on the reviewed values; there's no AI in this step. Each run stores a snapshot of every input value and of the full policy.
- **What it shows:**
  - A recommendation: APPROVE, REFER or DECLINE.
  - 6 policy rules, each with an explanation in numbers.
  - 27 consistency checks for the demo case.
  - 10 metrics, each with its formula and links back to the source field in the PDF.
- **Locking:** once analysed, fields and uploads are locked. **Reabrir revisión** (reason required) unlocks them. Re-running creates a new analysis, and older ones stay in the history as replaced.
- **Policy page:** `/policy` shows the rules, the metric formulas and the checks read-only. The thresholds are **illustrative**.
- **Verified:**
  - 83 Vitest tests. They include exact metric values for the demo borrower, the missing-versus-failing behaviour, the explanation wording, every consistency check, and a Postgres test of run → lock → reopen → re-run, with the snapshot kept.
  - Two Playwright tests, one of them covering the whole path: review → APPROVE → source link → reopen → correction → DECLINE.
  - `tsc` and `next build`.

### Phase 2 notes

- **Extraction runs automatically after upload.**
  - The five sample PDFs use cached results, built from the sample data and labelled "caché".
  - Any other PDF goes to Claude, which needs `ANTHROPIC_API_KEY`. Without the key, the document fails with a clear message and a **Reintentar** button.
- **Review:** the **Revisión** tab shows the PDF next to the extracted fields. Hovering over or clicking a field highlights its quote in the PDF. The analyst confirms, corrects (with a reason) or leaves each field empty. A document is done when every field has been reviewed.
- **Verified:**
  - 64 Vitest tests, including the Postgres integration tests.
  - Every cached quote can be located in its sample PDF on the stated page.
  - One Playwright test covering upload → cached extraction → highlight → confirm, correct and leave empty.
  - `tsc` and `next build`.
- **Not verified:**
  - Live Claude extraction. It's tested only with a mocked client, because no API key was available.
  - Accuracy on real Modelo 303 PDFs.
  - The Modelo 303 casilla numbers against the official AEAT design (see `src/lib/fields.ts`).
  - A Vercel deployment.
- **Known limitation:** on narrow screens the PDF keeps its initial width and scrolls sideways.

### Phase 1 notes

- The case page shows all four steps. Only **Documentos** is active for now. Uploaded documents stay in the **Subido** status until Phase 2 adds extraction, and with it the *extrayendo*, *pendiente de revisión*, *confirmado* and *error / reintentar* statuses.
- The sample PDFs in `samples/` are **synthetic**. They're labelled on the page, their layout is simplified, and they have no official casilla numbers. Use them to test the flow; they don't show extraction accuracy.
- **Verified:**
  - 23 Vitest tests, including a Postgres integration test.
  - `tsc` and `next build`.
  - A manual browser pass against a production build: login, wrong password, case creation, upload of the samples, rejection of non-PDFs and duplicates, authenticated file download, the activity log, and the mobile layout.
- **Not yet verified:** a deployment to Vercel with Neon and Blob.
