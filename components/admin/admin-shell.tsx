import type { ReactNode } from "react";

import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-sidebar";
import { countPendingAdminTranslatorComments } from "@/lib/data/comments";
import { countPendingAdminTranslatorRequests } from "@/lib/data/requests";
import { getAppSettings } from "@/lib/settings";

export async function AdminShell({ children }: { children: ReactNode }) {
  const [pendingRequestCount, pendingCommentCount, settings] = await Promise.all([
    countPendingAdminTranslatorRequests(),
    countPendingAdminTranslatorComments(),
    getAppSettings(),
  ]);

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <AdminSidebar
          pendingRequestCount={pendingRequestCount}
          pendingCommentCount={pendingCommentCount}
          logoUrl={settings.logoUrl}
          logoDesktopHeight={settings.logoDesktopHeight}
          logoMobileHeight={settings.logoMobileHeight}
        />
        <div className="min-w-0 flex-1">
          <AdminMobileNav
            pendingRequestCount={pendingRequestCount}
            pendingCommentCount={pendingCommentCount}
            logoUrl={settings.logoUrl}
            logoDesktopHeight={settings.logoDesktopHeight}
            logoMobileHeight={settings.logoMobileHeight}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
