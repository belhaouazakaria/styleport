import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { GrowthBudgetWarnings } from "@/components/admin/growth-budget-warnings";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { listGrowthBudgetWarnings } from "@/lib/growth/economics/warnings";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GrowthWarningsPage() {
  await requireAdminRoute();
  const warnings = await listGrowthBudgetWarnings();
  return (
    <>
      <AdminTopbar title="Growth budget warnings" subtitle="Review and acknowledge recorded 70% and 90% budget thresholds." />
      <main className="space-y-5 p-4 sm:p-6">
        <Link href="/admin/growth/spend" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          ← Growth economics
        </Link>
        <GrowthBudgetWarnings warnings={warnings} />
      </main>
    </>
  );
}
