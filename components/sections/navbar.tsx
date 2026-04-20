import Link from "next/link";
import { LayoutGrid, MessageSquarePlus, Shield } from "lucide-react";

import { RequestTranslatorModal } from "@/components/public/request-translator-modal";
import { APP_NAME } from "@/lib/constants";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-black text-white shadow-sm transition group-hover:bg-brand-600">
            SP
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">{APP_NAME}</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <RequestTranslatorModal
            triggerLabel="Request"
            icon={<MessageSquarePlus className="h-4 w-4" />}
            triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          />
          <Link
            href="/#translator-catalog"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-ink transition hover:bg-muted-surface hover:text-ink"
          >
            <LayoutGrid className="h-4 w-4" />
            Discover
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-ink transition hover:bg-muted-surface hover:text-ink"
          >
            <Shield className="h-4 w-4" />
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
