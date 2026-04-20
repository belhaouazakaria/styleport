interface KpiCardProps {
  label: string;
  value: number | string;
  hint?: string;
}

export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-white p-5 shadow-[0_20px_35px_-30px_rgba(17,24,39,0.22)]">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">{label}</p>
      <p className="font-display mt-2 text-4xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted-ink">{hint}</p> : null}
    </article>
  );
}
