"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const primary = [ ["", "Overview"], ["/approvals", "Reviews"], ["/creative", "Studio"],
  ["/analytics", "Analytics"], ["/accounts", "Accounts"], ["/settings", "Settings"] ];
const tools = [ ["/viral", "Source experiments"], ["/intelligence", "Operations"],
  ["/reports", "Daily reports"], ["/spend", "AI spending"], ["/cadence", "Daily targets"],
  ["/warnings", "Budget alerts"], ["/ideas", "Ideas"], ["/translators", "Translator planning"],
  ["/market-research", "Market research"], ["/opportunities", "Opportunities"],
  ["/strategy", "Account strategy"], ["/learning", "Learning"], ["/attribution", "Attribution"] ];
export function GrowthNav() {
  const path = usePathname();
  return <nav aria-label="Growth workspace" className="border-border border-b bg-white px-4 py-3 sm:px-8">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1">
      {primary.map(([suffix, label]) => <Link key={suffix} href={"/admin/growth" + suffix}
        aria-current={path === "/admin/growth" + suffix ? "page" : undefined}
        className={"rounded-lg px-3 py-2 text-sm font-semibold transition " +
          (path === "/admin/growth" + suffix ? "bg-[#173e35] text-white" : "text-muted-ink hover:bg-muted-surface hover:text-ink")}>{label}</Link>)}
      <details className="group relative sm:ml-auto">
        <summary className="text-muted-ink cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold">More tools</summary>
        <div className="border-border absolute right-0 z-30 mt-2 grid w-64 gap-1 rounded-xl border bg-white p-2 shadow-lg">
          {tools.map(([suffix, label]) => <Link key={suffix} href={"/admin/growth" + suffix}
            aria-current={path === "/admin/growth" + suffix ? "page" : undefined}
            onClick={event => event.currentTarget.closest("details")?.removeAttribute("open")}
            className="hover:bg-muted-surface rounded-lg px-3 py-2 text-sm">{label}</Link>)}
        </div>
      </details>
    </div>
  </nav>;
}
