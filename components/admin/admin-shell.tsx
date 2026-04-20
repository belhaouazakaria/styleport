import type { ReactNode } from "react";

import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-sidebar";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <AdminSidebar />
        <div className="min-w-0 flex-1">
          <AdminMobileNav />
          {children}
        </div>
      </div>
    </div>
  );
}
