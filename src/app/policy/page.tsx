import { fmtMetric, metricCatalog } from '@/lib/analysis';
import { policy } from '@/policy/policy';

export default function PolicyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Política de crédito</h1>
        <p className="text-sm text-muted">{policy.name} · versión <span className="num">{policy.version}</span> · solo lectura</p>
      </div>
      {policy.illustrative && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-warn">
          Umbrales ilustrativos de demostración. No representan la política de ninguna entidad.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Reglas</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Regla</th><th className="px-4 py-3">Métrica</th><th className="px-4 py-3 text-right">Umbral</th><th className="px-4 py-3">Tipo</th></tr>
            </thead>
            <tbody>
              {policy.rules.map((r, i) => {
                const m = metricCatalog.find(x => x.key === r.metric)!;
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="num px-4 py-3 text-muted">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{r.label}</td>
                    <td className="px-4 py-3">{m.label}</td>
                    <td className="num px-4 py-3 text-right">{r.operator === 'gte' ? '≥' : '≤'} {fmtMetric(m.unit, r.threshold)}</td>
                    <td className="px-4 py-3">{r.severity === 'hard' ? 'Excluyente' : 'Alerta'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recomendación</h2>
        <ul className="list-inside list-disc rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <li><b>Denegar</b> si se incumple cualquier regla excluyente.</li>
          <li><b>Revisión manual</b> si no, cuando se incumple una alerta, falta un dato o una comprobación de coherencia no es correcta. Un dato faltante nunca cuenta como incumplimiento.</li>
          <li><b>Aprobar</b> si se cumplen todas las reglas y comprobaciones.</li>
          <li>La recomendación no es la decisión: el analista registra la decisión final con su motivo.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Métricas</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">Métrica</th><th className="px-4 py-3">Fórmula</th></tr>
            </thead>
            <tbody>
              {metricCatalog.map(m => (
                <tr key={m.key} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{m.label}</td>
                  <td className="px-4 py-3">{m.formula}{m.note && <p className="text-xs text-muted">{m.note}</p>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Comprobaciones de coherencia</h2>
        <ul className="list-inside list-disc rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <li>Modelo 303, por tipo: base × tipo = cuota (tolerancia 1 €).</li>
          <li>Modelo 303: suma de cuotas = total cuota devengada [27].</li>
          <li>Modelo 303: [27] − [45] = resultado régimen general [46].</li>
          <li>Cuatro trimestres consecutivos de Modelo 303.</li>
          <li>El periodo de cada documento coincide con el indicado al subirlo.</li>
          <li>El NIF de todos los documentos coincide con el del caso.</li>
        </ul>
      </section>
    </div>
  );
}
