import type { LucideIcon } from 'lucide-react';

type MetricCardProps = {
  label: string;
  value: string;
  hint: string;
  icon?: LucideIcon;
};

export function MetricCard({ label, value, hint, icon: Icon }: MetricCardProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</div>
        {Icon ? (
          <div className="rounded-2xl bg-cyan-400/10 p-2 text-cyan-300"><Icon size={16}/></div>
        ) : null}
      </div>
      <div className="mt-4 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-3 text-sm text-slate-400">{hint}</div>
    </div>
  );
}
