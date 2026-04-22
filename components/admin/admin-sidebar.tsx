import Link from "next/link";
import {
  BarChart3,
  Cog,
  FolderTree,
  LayoutTemplate,
  MessageSquareText,
  PlusSquare,
  ScrollText,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/translators", label: "Translators", icon: Sparkles },
  { href: "/admin/translators/new", label: "Create Translator", icon: PlusSquare },
  { href: "/admin/translators/ai/new", label: "Create With AI", icon: Sparkles },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/requests", label: "Create Submissions", icon: MessageSquareText },
  { href: "/admin/usage-protection", label: "Usage Protection", icon: ShieldAlert },
  { href: "/admin/ads", label: "Monetization", icon: LayoutTemplate },
  { href: "/admin/settings", label: "Settings", icon: Cog },
  { href: "/admin/logs", label: "Logs", icon: ScrollText },
];

export function AdminSidebar() {
  return (
    <aside className="hidden w-72 border-r border-border bg-surface p-5 lg:block">
      <Link href="/admin" className="mb-8 flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-black text-white shadow-sm">
          SP
        </span>
        <div>
          <p className="font-display text-lg font-semibold text-ink">StylePort</p>
          <p className="text-xs text-muted-ink">Admin Console</p>
        </div>
      </Link>

      <nav className="space-y-1">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-ink transition hover:bg-muted-surface hover:text-ink"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function AdminMobileNav() {
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-border bg-surface px-4 py-2 lg:hidden">
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted-surface px-3 py-1.5 text-xs font-medium text-muted-ink"
        >
          <item.icon className="h-3.5 w-3.5" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
