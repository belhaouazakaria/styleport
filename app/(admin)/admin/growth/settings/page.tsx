import { AdminTopbar } from "@/components/admin/admin-topbar";
import { GrowthSettingsForm } from "@/components/admin/growth-settings-form";
import { requireAdminRoute } from "@/lib/auth";
import { getGrowthFoundationOverview } from "@/lib/growth/admin";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function GrowthSettingsPage() {
  await requireAdminRoute();
  const overview = await getGrowthFoundationOverview();
  return <><AdminTopbar title="Growth settings" subtitle="Accounts, daily targets and operating limits." />
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["cadence", "Daily targets", "How much to prepare each day"], ["spend", "AI spending", "Usage and budget limits"], ["warnings", "Budget alerts", "Requests that need attention"]].map(([path, title, text]) =>
          <Link key={path} href={"/admin/growth/" + path} className="border-border rounded-xl border bg-white p-5 hover:border-brand-500"><strong>{title}</strong><p className="text-muted-ink mt-1 text-sm">{text}</p></Link>)}
      </div>
        <GrowthSettingsForm
          initial={{
            enabled: overview.settings.enabled,
            intensity: overview.settings.intensity,
            workerBatchSize: overview.settings.workerBatchSize,
            ownedDomains: overview.settings.ownedDomains,
            defaultPinterestDestinationDomain: overview.settings.defaultPinterestDestinationDomain === "translator.whattypeof.com" ? "translator.whattypeof.com" : "saytwist.com",
            attributionEnabled: overview.settings.attributionEnabled,
            attributionWindowDays: overview.settings.attributionWindowDays,
            attributionSessionRetentionDays:
              overview.settings.attributionSessionRetentionDays,
            attributionEventRetentionDays:
              overview.settings.attributionEventRetentionDays,
            evergreenCooldownDays:
              overview.settings.evergreenCooldownDays,
            aiDailyBudgetCents: overview.settings.aiDailyBudgetCents,
            aiMonthlyBudgetCents: overview.settings.aiMonthlyBudgetCents,
            aiImagesPerDayCap: overview.settings.aiImagesPerDayCap,
            translatorCreatesPerDayCap: overview.settings.translatorCreatesPerDayCap,
            translatorUpdatesPerDayCap: overview.settings.translatorUpdatesPerDayCap,
            ideaCreatesPerWeekCap: overview.settings.ideaCreatesPerWeekCap,
          }}
        />
    </main></>;
}
