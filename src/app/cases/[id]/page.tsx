import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import DocumentUploader from '@/components/DocumentUploader';
import StatusBadge from '@/components/StatusBadge';
import { getCase } from '@/lib/cases';
import { caseStatusLabels, documentTypeLabels, extractionStatusLabels } from '@/lib/documents';

export const dynamic = 'force-dynamic';

const steps = [
  { id: 'documentos', label: 'Documentos', available: true },
  { id: 'revision', label: 'Revisión', available: false },
  { id: 'analisis', label: 'Análisis', available: false },
  { id: 'memo', label: 'Memo', available: false },
] as const;

const extractionTone = { pending: 'neutral', extracting: 'info', needs_review: 'warn', confirmed: 'ok', failed: 'bad' } as const;

const eventLabels: Record<string, string> = {
  'case.created': 'Caso creado',
  'document.uploaded': 'Documento subido',
};

const eur = (v: string) => Number(v).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const when = (d: Date) => d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = z.uuid().safeParse(id).success ? await getCase(id) : null;
  if (!data) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">← Casos</Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-semibold">{data.borrowerName}</h1>
          <span className="num text-sm text-muted">NIF {data.nif}</span>
          {data.requestedAmount && <span className="num text-sm text-muted">Solicitado {eur(data.requestedAmount)}</span>}
          <StatusBadge label={caseStatusLabels[data.status]} />
        </div>
      </div>

      <ol className="flex flex-wrap gap-2 border-b border-line text-sm" aria-label="Pasos del caso">
        {steps.map((step, i) => (
          <li key={step.id}
            className={`-mb-px border-b-2 px-3 py-2 ${step.available ? 'border-brand font-medium text-ink' : 'border-transparent text-slate-400'}`}
            aria-current={step.available ? 'step' : undefined}
            title={step.available ? undefined : 'Disponible en una fase posterior'}>
            {i + 1}. {step.label}
          </li>
        ))}
      </ol>

      <section className="space-y-4">
        <DocumentUploader caseId={data.id} />

        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">Documento</th><th className="px-4 py-3">Periodo</th><th className="px-4 py-3">Archivo</th>
                <th className="px-4 py-3">Subido</th><th className="px-4 py-3">SHA-256</th><th className="px-4 py-3">Estado</th></tr>
            </thead>
            <tbody>
              {data.documents.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Aún no hay documentos en este caso.</td></tr>}
              {data.documents.map(doc => (
                <tr key={doc.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{documentTypeLabels[doc.type]}</td>
                  <td className="num px-4 py-3">{doc.period}</td>
                  <td className="max-w-56 truncate px-4 py-3">
                    <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="text-brand hover:underline" title={doc.filename}>{doc.filename}</a>
                  </td>
                  <td className="num px-4 py-3 text-muted">{when(doc.uploadedAt)}</td>
                  <td className="num px-4 py-3 font-mono text-xs text-muted" title={doc.sha256}>{doc.sha256.slice(0, 12)}…</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={extractionStatusLabels[doc.extractionStatus]} tone={extractionTone[doc.extractionStatus]} />
                    {doc.extractionError && <p className="mt-1 text-xs text-bad">{doc.extractionError}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.documents.length > 0 && (
          <p className="text-xs text-muted">La extracción automática de datos llega en la Fase 2. Por ahora los documentos quedan en estado «Subido».</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Actividad</h2>
        <ol className="space-y-1 text-sm">
          {data.events.map(event => (
            <li key={event.id} className="flex gap-3">
              <span className="num w-32 shrink-0 text-muted">{when(event.createdAt)}</span>
              <span>{eventLabels[event.type] ?? event.type}
                {event.type === 'document.uploaded' && typeof event.payload === 'object' && event.payload !== null && 'filename' in event.payload
                  ? <span className="text-muted"> · {String(event.payload.filename)}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
