const tones: Record<string, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-300',
  info: 'bg-blue-50 text-blue-800 ring-blue-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  ok: 'bg-green-50 text-green-800 ring-green-200',
  bad: 'bg-red-50 text-red-800 ring-red-200',
};

export default function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof tones }) {
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{label}</span>;
}
