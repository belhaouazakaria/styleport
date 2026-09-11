interface KpiCardProps {
  label: string;
  value: number | string;
  hint?: string;
}

export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <article className="relative overflow-hidden rounded-[1.5rem] border border-border bg-white p-5 shadow-[var(--shadow-soft)] before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-brand-500">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-ink">{label}</p>
      <p className="font-display mt-2 text-4xl font-bold text-ink">{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted-ink">{hint}</p> : null}
    </article>
  );
}
