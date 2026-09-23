import Link from 'next/link';
import type { AnalysisRow } from '@/lib/analysis-runner';
import { fmtMetric, type Check, type Metric, type RuleResult } from '@/lib/analysis';
import StatusBadge from './StatusBadge';

export const recommendationStyle = {
  APPROVE: { label: 'Aprobar', cls: 'border-green-300 bg-green-50 text-ok' },
  REFER: { label: 'Revisión manual', cls: 'border-amber-300 bg-amber-50 text-warn' },
  DECLINE: { label: 'Denegar', cls: 'border-red-300 bg-red-50 text-bad' },
} as const;

const ruleStatus = {
  pass: { label: 'Cumple', tone: 'ok' },
  fail: { label: 'No cumple', tone: 'bad' },
  missing: { label: 'Sin datos', tone: 'warn' },
} as const;
const checkStatus = {
  pass: { label: 'Correcto', tone: 'ok' },
  fail: { label: 'Incoherente', tone: 'bad' },
  missing: { label: 'Sin datos', tone: 'warn' },
} as const;

const when = (d: Date) => d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

function SourceLink({ caseId, fieldId, children }: { caseId: string; fieldId: string | null; children: React.ReactNode }) {
  if (!fieldId) return <>{children}</>;
  return <Link href={`/cases/${caseId}?paso=revision&campo=${fieldId}`} className="text-brand hover:underline">{children}</Link>;
}

function RulesTable({ rules }: { rules: RuleResult[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
          <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Regla</th><th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3 text-right">Umbral</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Resultado</th></tr>
        </thead>
        <tbody>
          {rules.map(r => (
            <tr key={r.id} className="border-b border-line align-top last:border-0" data-testid={`rule-${r.id}`}>
              <td className="num px-4 py-3 text-muted">{r.index}</td>
              <td className="px-4 py-3"><p className="font-medium">{r.label}</p><p className="mt-1 text-xs text-muted" data-testid="rule-explanation">{r.explanation}</p></td>
              <td className="num whitespace-nowrap px-4 py-3 text-right">{r.value !== null && r.unit ? fmtMetric(r.unit, r.value) : '—'}</td>
              <td className="num whitespace-nowrap px-4 py-3 text-right">{r.operator === 'gte' ? '≥' : '≤'} {r.unit ? fmtMetric(r.unit, r.threshold) : r.threshold}</td>
              <td className="px-4 py-3 text-xs">{r.severity === 'hard' ? 'Excluyente' : 'Alerta'}</td>
              <td className="px-4 py-3"><StatusBadge {...ruleStatus[r.status]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChecksList({ checks, caseId }: { checks: Check[]; caseId: string }) {
  const notPassed = checks.filter(c => c.status !== 'pass');
  const passed = checks.filter(c => c.status === 'pass');
  const row = (c: Check) => (
    <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm" data-testid={`check-${c.id}`}>
      <div className="min-w-0">
        <p className="font-medium">{c.label}</p>
        <p className="num text-xs text-muted">{c.detail}
          {c.fieldIds.length > 0 && <> · <SourceLink caseId={caseId} fieldId={c.fieldIds[0]!}>ver origen</SourceLink></>}</p>
      </div>
      <StatusBadge {...checkStatus[c.status]} />
    </li>
  );
  return (
    <div className="rounded-lg border border-line bg-surface">
      {notPassed.length > 0 ? <ul className="divide-y divide-line">{notPassed.map(row)}</ul>
        : <p className="px-4 py-3 text-sm text-ok">Las {checks.length} comprobaciones son correctas.</p>}
      {passed.length > 0 && (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted">Ver {passed.length} comprobaciones correctas</summary>
          <ul className="divide-y divide-line border-t border-line">{passed.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

function MetricsTable({ metrics, caseId }: { metrics: Metric[]; caseId: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
          <tr><th className="px-4 py-3">Métrica</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3">Fórmula y datos</th></tr>
        </thead>
        <tbody>
          {metrics.map(m => (
            <tr key={m.key} className="border-b border-line align-top last:border-0" data-testid={`metric-${m.key}`}>
              <td className="px-4 py-3"><p className="font-medium">{m.label}</p>{m.period && <p className="num text-xs text-muted">{m.period}</p>}</td>
              <td className="num whitespace-nowrap px-4 py-3 text-right font-medium">{m.value !== null ? fmtMetric(m.unit, m.value) : <span className="text-warn">Sin datos</span>}</td>
              <td className="px-4 py-3 text-xs">
                <p>{m.formula}</p>
                {m.missingReason && <p className="mt-1 text-warn">{m.missingReason}</p>}
                <details className="mt-1">
                  <summary className="cursor-pointer text-muted">{m.inputs.length} dato(s) de origen</summary>
                  <ul className="mt-1 space-y-0.5">
                    {m.inputs.map((i, n) => (
                      <li key={n} className="num"><SourceLink caseId={caseId} fieldId={i.fieldId}>{i.label}</SourceLink>: {i.value === null ? '—' : fmtMetric('eur', i.value)}</li>
                    ))}
                  </ul>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalysisView({ analysis, history, caseId, stale }: { analysis: AnalysisRow; history: AnalysisRow[]; caseId: string; stale: boolean }) {
  const rec = recommendationStyle[analysis.recommendation];
  const p = analysis.inputs.policy;
  return (
    <div className="space-y-6">
      <div className={`rounded-lg border px-5 py-4 ${rec.cls}`} data-testid="recommendation">
        <p className="text-xs font-semibold uppercase tracking-wide">Recomendación del sistema</p>
        <p className="mt-1 text-2xl font-semibold">{rec.label} <span className="text-base font-normal">({analysis.recommendation})</span></p>
        <p className="mt-1 text-sm text-ink">
          {p.name} · versión <span className="num">{analysis.policyVersion}</span>{p.illustrative && ' · umbrales ilustrativos'} · {when(analysis.createdAt)}
        </p>
        <p className="mt-2 text-xs text-muted">Regla aplicada: cualquier regla excluyente incumplida → Denegar; si no, cualquier alerta, dato faltante o comprobación incoherente → Revisión manual; si no, Aprobar. La decisión final la registra el analista.</p>
      </div>
      {stale && <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-warn">La revisión se ha reabierto. Este análisis quedará sustituido cuando vuelvas a ejecutarlo.</p>}

      <section className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Reglas de la política</h2><RulesTable rules={analysis.ruleResults} /></section>
      <section className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Comprobaciones de coherencia</h2><ChecksList checks={analysis.checks} caseId={caseId} /></section>
      <section className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Métricas</h2><MetricsTable metrics={analysis.metrics} caseId={caseId} /></section>

      {history.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Historial de análisis</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
            {history.map((a, i) => (
              <li key={a.id} className="flex flex-wrap gap-3 px-4 py-2.5">
                <span className="num text-muted">{when(a.createdAt)}</span>
                <span className="font-medium">{recommendationStyle[a.recommendation].label}</span>
                <span className="num text-muted">política {a.policyVersion}</span>
                {i > 0 && <span className="text-muted">· sustituido</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
