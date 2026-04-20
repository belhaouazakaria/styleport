import { AdminTopbar } from "@/components/admin/admin-topbar";
import { UsageProtectionForm } from "@/components/admin/usage-protection-form";
import { getUsageProtectionDashboardData } from "@/lib/usage-protection";

export const dynamic = "force-dynamic";

export default async function AdminUsageProtectionPage() {
  const data = await getUsageProtectionDashboardData();

  return (
    <>
      <AdminTopbar
        title="Usage Protection"
        subtitle="Control per-IP quotas, global token cap behavior, emergency shutdown status, and alerting."
      />
      <main className="p-4 sm:p-6">
        <UsageProtectionForm initial={data} />
      </main>
    </>
  );
}
