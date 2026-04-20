import { LogoutButton } from "@/components/admin/logout-button";

interface AdminTopbarProps {
  title: string;
  subtitle?: string;
}

export function AdminTopbar({ title, subtitle }: AdminTopbarProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border bg-surface px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-ink">{subtitle}</p> : null}
      </div>
      <LogoutButton />
    </div>
  );
}
