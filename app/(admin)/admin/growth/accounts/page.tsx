import { GrowthPinterestConnectionStatus, GrowthPinterestPublicationRole } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { PinterestAccountActions } from "@/components/admin/pinterest-account-actions";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { PINTEREST_OAUTH_SCOPES, getPinterestConfigurationState } from "@/lib/growth/pinterest/config";
import { getPinterestAccountsOverview } from "@/lib/growth/pinterest/accounts";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const roles = [
  [GrowthPinterestPublicationRole.SAYTWIST, "SayTwist", "Utility and translator discovery"],
  [GrowthPinterestPublicationRole.SAYTWIST_IDEAS, "SayTwist Ideas", "Editorial inspiration and save intent"],
  [GrowthPinterestPublicationRole.SAYTWIST_PLAYGROUND, "SayTwist Playground", "Playful language and sharing"],
] as const;

function date(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Never";
}

function expiryStatus(value: Date | null) {
  if (!value) return "Unknown";
  return value <= new Date() ? `Expired · ${date(value)}` : `Valid · ${date(value)}`;
}

export default async function PinterestAccountsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminRoute();
  const [accounts, params] = await Promise.all([getPinterestAccountsOverview(), searchParams]);
  const configuration = getPinterestConfigurationState();
  return (
    <>
      <AdminTopbar title="Pinterest accounts" subtitle="OAuth connections, publication roles, credentials health, and read-only board discovery." />
      <main className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/growth" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Growth overview</Link>
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", configuration.configured && configuration.config.environment === "sandbox" ? "bg-amber-100 text-amber-900" : "bg-brand-100 text-brand-900")}>{configuration.configured ? configuration.config.environment.toUpperCase() : "NOT CONFIGURED"}</span>
        </div>

        {params.status ? <div className="rounded-xl border border-border bg-white p-4 text-sm text-ink">OAuth result: <strong>{params.status.replaceAll("_", " ")}</strong></div> : null}
        {!configuration.configured ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          Pinterest is not configured. Add the documented server-only environment variables to enable OAuth. Normal application behavior remains available.
        </div> : null}

        <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
          <p className="section-kicker">Scope contract</p>
          <h2 className="font-display mt-1 text-xl font-bold text-ink">Requested access</h2>
          <p className="mt-2 text-sm text-muted-ink">{PINTEREST_OAUTH_SCOPES.join(" · ")}</p>
        </section>

        <div className="grid gap-5 xl:grid-cols-3">
          {roles.map(([role, label, description]) => {
            const account = accounts.find((candidate) => candidate.activeRole === role);
            const missingScopes = account ? PINTEREST_OAUTH_SCOPES.filter((scope) => !account.grantedScopes.includes(scope)) : [];
            return <section key={role} className="rounded-2xl border border-border bg-white p-5">
              <p className="section-kicker">{label}</p>
              <p className="mt-1 text-sm text-muted-ink">{description}</p>
              {!account ? <div className="mt-5 rounded-xl border border-dashed border-border p-4">
                <p className="text-sm text-muted-ink">No active account assigned.</p>
                {configuration.configured ? <Link className={cn(buttonVariants({ size: "sm" }), "mt-3")} href={`/api/admin/growth/pinterest/oauth/start?role=${role}`}>Connect</Link> : null}
              </div> : <>
                {account.profileImageUrl ? <Image unoptimized width={56} height={56} src={account.profileImageUrl} alt={`${account.username} Pinterest profile`} className="mt-5 h-14 w-14 rounded-full border border-border object-cover" referrerPolicy="no-referrer" /> : null}
                <dl className="mt-5 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Status</dt><dd className="font-bold text-ink">{account.connectionStatus}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Username</dt><dd className="font-medium text-ink">@{account.username}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Business name</dt><dd className="text-right text-ink">{account.businessName || "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Website</dt><dd className="max-w-44 truncate text-right text-ink">{account.websiteUrl || "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Pinterest type</dt><dd className="text-right text-ink">{account.pinterestAccountType || "Not reported"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Environment</dt><dd className="text-right font-bold text-ink">{account.apiEnvironment}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Access token</dt><dd className="text-right text-ink">{expiryStatus(account.accessTokenExpiresAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Refresh credential</dt><dd className="text-right text-ink">{expiryStatus(account.refreshTokenExpiresAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Account sync</dt><dd className="text-right text-ink">{date(account.lastAccountSyncAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Board sync</dt><dd className="text-right text-ink">{date(account.lastBoardSyncAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-ink">Boards</dt><dd className="font-bold text-ink">{account.boards.filter((board) => board.isActive).length}</dd></div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-ink">Scopes: {account.grantedScopes.join(", ")}</p>
                <p className={cn("mt-1 text-xs", missingScopes.length ? "text-red-700" : "text-emerald-700")}>{missingScopes.length ? `Missing required scopes: ${missingScopes.join(", ")}` : "Required scope set granted"}</p>
                {account.lastConnectionError ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{account.lastConnectionError}</p> : null}
                <PinterestAccountActions accountId={account.id} currentRole={account.publicationRole} />
                {configuration.configured ? <Link className={cn(buttonVariants({ size: "sm" }), "mt-3")} href={`/api/admin/growth/pinterest/oauth/start?role=${role}`}>{account.connectionStatus === GrowthPinterestConnectionStatus.REAUTH_REQUIRED ? "Reconnect required" : "Reconnect"}</Link> : null}
                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="text-sm font-bold text-ink">Synchronized boards</h3>
                  <div className="mt-2 max-h-64 space-y-2 overflow-auto">
                    {account.boards.length ? account.boards.map((board) => <div key={board.id} className="rounded-lg bg-muted-surface p-3 text-xs">
                      <div className="flex justify-between gap-2"><strong>{board.name}</strong><span>{board.isActive ? "Active" : "Not seen"}</span></div>
                      <p className="mt-1 text-muted-ink">{board.pinterestBoardId} · seen {date(board.lastSeenAt)}</p>
                    </div>) : <p className="text-xs text-muted-ink">No boards synchronized.</p>}
                  </div>
                </div>
              </>}
            </section>;
          })}
        </div>
      </main>
    </>
  );
}
