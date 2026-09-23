import Link from 'next/link';
import NewCaseForm from '@/components/NewCaseForm';
import StatusBadge from '@/components/StatusBadge';
import { listCases } from '@/lib/cases';
import { caseStatusLabels } from '@/lib/documents';

export const dynamic = 'force-dynamic';

export default async function CasesPage() {
  const rows = await listCases();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Casos</h1>
          <p className="text-sm text-muted">Documentación, revisión, análisis y memo de crédito por prestatario.</p>
        </div>
      </div>
      <NewCaseForm />
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Prestatario</th><th className="px-4 py-3">NIF</th><th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Documentos</th><th className="px-4 py-3">Recomendación</th><th className="px-4 py-3">Creado</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Todavía no hay casos. Crea uno o ejecuta <code>npm run db:seed</code>.</td></tr>}
            {rows.map(row => (
              <tr key={row.id} className="border-b border-line last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium"><Link href={`/cases/${row.id}`} className="text-brand hover:underline">{row.borrowerName}</Link></td>
                <td className="px-4 py-3 num">{row.nif}</td>
                <td className="px-4 py-3"><StatusBadge label={caseStatusLabels[row.status]} /></td>
                <td className="px-4 py-3 text-right num">{row.documentCount}</td>
                <td className="px-4 py-3 text-muted">—</td>
                <td className="px-4 py-3 num text-muted">{row.createdAt.toLocaleDateString('es-ES')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
