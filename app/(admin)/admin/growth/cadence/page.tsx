import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { GrowthDailyCadenceForm } from "@/components/admin/growth-daily-cadence-form";
import { requireAdminRoute } from "@/lib/auth";
import { getGrowthCadencePolicy } from "@/lib/growth/portfolio/cadence-settings";
import { getGrowthSettings } from "@/lib/growth/settings";

export const dynamic = "force-dynamic";

export default async function GrowthCadencePage() {
  await requireAdminRoute();
  const [policy, limits] = await Promise.all([
    getGrowthCadencePolicy(),
    getGrowthSettings(),
  ]);
  return (
    <>
      <AdminTopbar
        title="Daily Growth cadence"
        subtitle="Owner-configured, adaptive daily draft targets. No automatic publication."
      />
      <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <Link href="/admin/growth"
          className="text-sm font-semibold text-brand-600 hover:underline">
          Back to Growth dashboard
        </Link>
        <GrowthDailyCadenceForm
          initial={policy}
          hardLimits={{
            translatorCreatesPerDay: limits.translatorCreatesPerDayCap,
            aiImagesPerDay: limits.aiImagesPerDayCap,
            aiDailyBudgetCents: limits.aiDailyBudgetCents,
            aiMonthlyBudgetCents: limits.aiMonthlyBudgetCents,
          }}
        />
      </main>
    </>
  );
}
