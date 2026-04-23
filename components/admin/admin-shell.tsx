import type { ReactNode } from "react";

import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-sidebar";
import { countPendingAdminTranslatorComments } from "@/lib/data/comments";
import { countPendingAdminTranslatorRequests } from "@/lib/data/requests";

export async function AdminShell({ children }: { children: ReactNode }) {
  const [pendingRequestCount, pendingCommentCount] = await Promise.all([
    countPendingAdminTranslatorRequests(),
    countPendingAdminTranslatorComments(),
  ]);

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <AdminSidebar pendingRequestCount={pendingRequestCount} pendingCommentCount={pendingCommentCount} />
        <div className="min-w-0 flex-1">
          <AdminMobileNav pendingRequestCount={pendingRequestCount} pendingCommentCount={pendingCommentCount} />
          {children}
        </div>
      </div>
    </div>
  );
}
