import { LogoutButton } from "@/components/admin/logout-button";

interface AdminTopbarProps {
  title: string;
  subtitle?: string;
}

export function AdminTopbar({ title, subtitle }: AdminTopbarProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border bg-page/70 px-4 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8 lg:py-8">
      <div>
        <p className="section-kicker">SayTwist Studio</p>
        <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-ink">{subtitle}</p> : null}
      </div>
      <LogoutButton />
    </div>
  );
}
