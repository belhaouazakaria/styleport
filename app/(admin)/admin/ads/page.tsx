import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdTable } from "@/components/admin/ad-table";
import { listAdminAds } from "@/lib/data/ads";

export const dynamic = "force-dynamic";

export default async function AdminAdsPage() {
  const ads = await listAdminAds();

  return (
    <>
      <AdminTopbar title="Monetization" subtitle="Manage ad placements and targeting rules." />
      <main className="space-y-4 p-4 sm:p-6">
        <div>
          <Link
            href="/admin/ads/new"
            className="inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Create placement
          </Link>
        </div>
        <AdTable ads={ads} />
      </main>
    </>
  );
}
