import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import AnalysisView, { recommendationStyle } from '@/components/AnalysisView';
import AutoRefresh from '@/components/AutoRefresh';
import CaseActionButton from '@/components/CaseActionButton';
import DocumentUploader from '@/components/DocumentUploader';
import ExtractButton from '@/components/ExtractButton';
import ReviewWorkspace, { type ReviewDoc } from '@/components/ReviewWorkspace';
import StatusBadge from '@/components/StatusBadge';
import type { DocumentRow, EventRow, FieldRow } from '@/db/schema';
import { listAnalyses } from '@/lib/analysis-runner';
import { getCase } from '@/lib/cases';
import { caseStatusLabels, documentTypeLabels, extractionStatusLabels } from '@/lib/documents';
import { fieldDef, fieldDefs, formatValue } from '@/lib/fields';
import { getFieldsForCase } from '@/lib/review';

export const dynamic = 'force-dynamic';

const extractionTone = { pending: 'neutral', extracting: 'info', needs_review: 'warn', confirmed: 'ok', failed: 'bad' } as const;

const eventLabels: Record<string, string> = {
  'case.created': 'Caso creado',
  'document.uploaded': 'Documento subido',
  'document.extraction_started': 'Extracción iniciada',
  'document.extraction_completed': 'Extracción completada',
  'document.extraction_failed': 'Error de extracción',
  'field.confirmed': 'Campo confirmado',
  'field.corrected': 'Campo corregido',
  'field.left_empty': 'Campo dejado vacío',
  'document.confirmed': 'Documento revisado',
  'analysis.completed': 'Análisis ejecutado',
  'case.review_reopened': 'Revisión reabierta',
};

const eur = (v: string) => Number(v).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const when = (d: Date) => d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

function eventDetail(event: EventRow): string | null {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof p.filename === 'string') parts.push(p.filename);
  if (typeof p.key === 'string') parts.push(p.key);
  if (event.type === 'analysis.completed' && typeof p.recommendation === 'string') parts.push(`recomendación ${p.recommendation}`, `política ${p.policyVersion}`);
  if (event.type === 'document.extraction_completed') parts.push(p.source === 'cached' ? 'caché' : String(p.model ?? 'IA'), `${p.fieldsFound}/${p.fieldsDefined} campos`);
  if (typeof p.error === 'string') parts.push(p.error);
  if (typeof p.reason === 'string' && p.reason) parts.push(`motivo: ${p.reason}`);
  return parts.length ? parts.join(' · ') : null;
}

// Early warnings during review. They only inform; the analysis runs the full consistency checks.
function warnings(doc: DocumentRow, docFields: FieldRow[], caseNif: string): string[] {
  const value = (key: string) => {
    const f = docFields.find(x => x.key === key);
    return f ? (f.reviewedAt ? f.confirmedValue : f.extractedValue) : null;
  };
  const out: string[] = [];
  const nif = value('nif');
  if (nif && nif !== caseNif) out.push(`El NIF del documento (${nif}) no coincide con el del caso (${caseNif}).`);
  const year = value('fiscal_year');
  if (doc.type === 'modelo_303') {
    const quarter = value('quarter');
    if (year && quarter && `${year}-Q${quarter}` !== doc.period) out.push(`El periodo del documento (${year}-Q${quarter}) no coincide con el indicado al subirlo (${doc.period}).`);
  } else if (year && year !== doc.period) {
    out.push(`El ejercicio del documento (${year}) no coincide con el indicado al subirlo (${doc.period}).`);
  }
  return out;
}

export default async function CasePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ paso?: string; campo?: string }>;
}) {
  const { id } = await params;
  const { paso, campo } = await searchParams;
  const data = z.uuid().safeParse(id).success ? await getCase(id) : null;
  if (!data) notFound();

  const [fieldRows, analysisRows] = await Promise.all([getFieldsForCase(data.id), listAnalyses(data.id)]);
  const latest = analysisRows[0] ?? null;
  const reviewable = data.documents.filter(d => d.extractionStatus === 'needs_review' || d.extractionStatus === 'confirmed');
  const working = data.documents.some(d => d.extractionStatus === 'extracting');
  const allConfirmed = data.documents.length > 0 && data.documents.every(d => d.extractionStatus === 'confirmed');
  const locked = data.status === 'analysed' || data.status === 'decided';

  const steps = [
    { id: 'documentos', label: 'Documentos', available: true },
    { id: 'revision', label: 'Revisión', available: reviewable.length > 0 },
    { id: 'analisis', label: 'Análisis', available: latest !== null || (allConfirmed && data.status === 'in_review') },
    { id: 'memo', label: 'Memo', available: false },
  ];
  const current = steps.find(s => s.id === paso && s.available)?.id ?? 'documentos';

  const reviewDocs: ReviewDoc[] = reviewable.map(doc => {
    const docFields = fieldRows.filter(r => r.documentId === doc.id).map(r => r.field);
    const order = fieldDefs[doc.type].map(f => f.key);
    docFields.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return {
      id: doc.id, label: documentTypeLabels[doc.type], period: doc.period, filename: doc.filename, status: doc.extractionStatus,
      source: doc.extractionSource, model: doc.extractionModel, warnings: warnings(doc, docFields, data.nif),
      fields: docFields.map(f => {
        const def = fieldDef(doc.type, f.key);
        return {
          id: f.id, key: f.key, label: def?.label ?? f.key, casilla: def?.casilla ?? null,
          extracted: f.extractedValue, extractedDisplay: formatValue(doc.type, f.key, f.extractedValue),
          confirmedDisplay: formatValue(doc.type, f.key, f.confirmedValue),
          page: f.page, quote: f.quote, status: f.status, reviewed: f.reviewedAt !== null, correctionReason: f.correctionReason,
        };
      }),
    };
  });

  return (
    <div className="space-y-6">
      <AutoRefresh active={working} />
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">← Casos</Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-semibold">{data.borrowerName}</h1>
          <span className="num text-sm text-muted">NIF {data.nif}</span>
          {data.requestedAmount && <span className="num text-sm text-muted">Solicitado {eur(data.requestedAmount)}</span>}
          <StatusBadge label={caseStatusLabels[data.status]} />
          {latest && <span className={`rounded border px-2 py-0.5 text-xs font-medium ${recommendationStyle[latest.recommendation].cls}`}>{recommendationStyle[latest.recommendation].label}</span>}
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-line text-sm" aria-label="Pasos del caso">
        {steps.map((step, i) => step.available ? (
          <Link key={step.id} href={`/cases/${data.id}?paso=${step.id}`} aria-current={current === step.id ? 'step' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 ${current === step.id ? 'border-brand font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {i + 1}. {step.label}
          </Link>
        ) : (
          <span key={step.id} className="-mb-px border-b-2 border-transparent px-3 py-2 text-slate-400"
            title={step.id === 'revision' ? 'Disponible cuando haya documentos extraídos' : step.id === 'analisis' ? 'Disponible cuando todos los documentos estén revisados' : 'Disponible en una fase posterior'}>
            {i + 1}. {step.label}
          </span>
        ))}
      </nav>

      {current === 'documentos' && (
        <section className="space-y-4">
          {locked
            ? <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">El caso está analizado. Para añadir documentos, reabre la revisión desde la pestaña Análisis.</p>
            : <DocumentUploader caseId={data.id} />}
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-3">Documento</th><th className="px-4 py-3">Periodo</th><th className="px-4 py-3">Archivo</th>
                  <th className="px-4 py-3">Subido</th><th className="px-4 py-3">SHA-256</th><th className="px-4 py-3">Estado</th></tr>
              </thead>
              <tbody>
                {data.documents.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Aún no hay documentos en este caso.</td></tr>}
                {data.documents.map(doc => (
                  <tr key={doc.id} className="border-b border-line last:border-0" data-testid="document-row">
                    <td className="px-4 py-3 font-medium">{documentTypeLabels[doc.type]}</td>
                    <td className="num px-4 py-3">{doc.period}</td>
                    <td className="max-w-56 truncate px-4 py-3">
                      <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="text-brand hover:underline" title={doc.filename}>{doc.filename}</a>
                    </td>
                    <td className="num px-4 py-3 text-muted">{when(doc.uploadedAt)}</td>
                    <td className="num px-4 py-3 font-mono text-xs text-muted" title={doc.sha256}>{doc.sha256.slice(0, 12)}…</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={extractionStatusLabels[doc.extractionStatus]} tone={extractionTone[doc.extractionStatus]} />
                        {doc.extractionSource === 'cached' && <span className="text-xs text-muted">caché</span>}
                        {doc.extractionStatus === 'failed' && <ExtractButton documentId={doc.id} label="Reintentar" />}
                        {doc.extractionStatus === 'pending' && <ExtractButton documentId={doc.id} label="Extraer datos" />}
                        {doc.extractionStatus === 'needs_review' && <Link href={`/cases/${data.id}?paso=revision`} className="text-xs text-brand hover:underline">Revisar →</Link>}
                      </div>
                      {doc.extractionError && doc.extractionStatus === 'failed' && <p className="mt-1 text-xs text-bad">{doc.extractionError}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {current === 'revision' && (
        <section className="space-y-4">
          {locked
            ? <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">El caso está analizado: los campos son de solo lectura. Para cambiarlos, reabre la revisión desde la pestaña Análisis.</p>
            : allConfirmed
              ? <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-ok">Revisión completa: todos los campos están revisados. <Link href={`/cases/${data.id}?paso=analisis`} className="font-medium underline">Ir al análisis →</Link></p>
              : <p className="text-sm text-muted">Confirma, corrige o deja vacío cada campo. El análisis solo usará valores revisados.</p>}
          <ReviewWorkspace docs={reviewDocs} locked={locked} initialFieldId={campo ?? null} />
        </section>
      )}

      {current === 'analisis' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Cálculo determinista sobre los valores revisados. La IA no interviene en este paso.</p>
            {data.status === 'in_review' && allConfirmed && (
              <CaseActionButton url={`/api/cases/${data.id}/analysis`} label={latest ? 'Volver a ejecutar el análisis' : 'Ejecutar análisis'} busyLabel="Analizando…" next={`/cases/${data.id}?paso=analisis`} />
            )}
            {data.status === 'analysed' && (
              <CaseActionButton url={`/api/cases/${data.id}/reopen`} label="Reabrir revisión" busyLabel="Reabriendo…" reasonLabel="Motivo para reabrir la revisión" variant="secondary" />
            )}
          </div>
          {data.status === 'in_review' && !allConfirmed && <p className="text-sm text-warn">Termina la revisión de todos los documentos para ejecutar el análisis.</p>}
          {latest
            ? <AnalysisView analysis={latest} history={analysisRows} caseId={data.id} stale={data.status === 'in_review'} />
            : <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-sm text-muted">Todavía no se ha ejecutado ningún análisis.</p>}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Actividad</h2>
        {(() => {
          const row = (event: EventRow) => {
            const detail = eventDetail(event);
            return (
              <li key={event.id} className="flex gap-3">
                <span className="num w-32 shrink-0 text-muted">{when(event.createdAt)}</span>
                <span>{eventLabels[event.type] ?? event.type}{detail && <span className="text-muted"> · {detail}</span>}</span>
              </li>
            );
          };
          const recent = data.events.slice(-8);
          const older = data.events.slice(0, -8);
          return (
            <div className="space-y-1 text-sm">
              {older.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-muted">Ver {older.length} eventos anteriores</summary>
                  <ol className="mt-1 space-y-1">{older.map(row)}</ol>
                </details>
              )}
              <ol className="space-y-1">{recent.map(row)}</ol>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
