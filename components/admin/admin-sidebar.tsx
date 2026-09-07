import Link from "next/link";
import {
  BarChart3,
  Cog,
  FolderTree,
  Globe,
  LayoutTemplate,
  MessageCircleMore,
  MessageSquareText,
  PlusSquare,
  ScrollText,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

interface AdminSidebarProps {
  pendingRequestCount: number;
  pendingCommentCount: number;
}

const links = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/translators", label: "Translators", icon: Sparkles },
  { href: "/admin/translators/new", label: "Create Translator", icon: PlusSquare },
  { href: "/admin/translators/ai/new", label: "Create With AI", icon: Sparkles },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/requests", label: "Create Submissions", icon: MessageSquareText },
  { href: "/admin/comments", label: "Comments", icon: MessageCircleMore },
  { href: "/admin/indexing", label: "Indexing", icon: Globe },
  { href: "/admin/usage-protection", label: "Usage Protection", icon: ShieldAlert },
  { href: "/admin/ads", label: "Monetization", icon: LayoutTemplate },
  { href: "/admin/settings", label: "Settings", icon: Cog },
  { href: "/admin/logs", label: "Logs", icon: ScrollText },
];

function linkBadgeCount(href: string, props: AdminSidebarProps) {
  if (href === "/admin/requests") {
    return props.pendingRequestCount;
  }

  if (href === "/admin/comments") {
    return props.pendingCommentCount;
  }

  return 0;
}

export function AdminSidebar(props: AdminSidebarProps) {
  return (
    <aside className="hidden w-72 border-r border-border bg-surface p-5 lg:block">
      <Link href="/admin" className="mb-8 flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#14B8A6] shadow-sm">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 22C8 22 7 20 8 17C9.5 12 14 10 17 10C20 10 23 11 24 14C25 17 24 20 22 22C20 24 16 25 13 24C10 23 9 22 8 22Z" fill="white"/>
            <path d="M8 22C7 19.5 8 15.5 12 13C16 10.5 21 11 24 14" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" fill="none"/>
            <path d="M10 23L8 27L13 24.5" fill="white"/>
            <rect x="5" y="4" width="3.5" height="2" rx="1" transform="rotate(-30 5 4)" fill="#FF7A59"/>
            <rect x="11" y="2.5" width="3.5" height="2" rx="1" transform="rotate(-10 11 2.5)" fill="#F59E0B"/>
            <rect x="17" y="4" width="3" height="2" rx="1" transform="rotate(15 17 4)" fill="#60C5F7"/>
          </svg>
        </span>
        <div>
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            <span className="text-[#0F172A]">Say</span><span className="text-[#14B8A6]">Twist</span>
          </span>
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
            <span>{item.label}</span>
            {linkBadgeCount(item.href, props) > 0 ? (
              <span className="ml-auto rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                {linkBadgeCount(item.href, props)}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function AdminMobileNav(props: AdminSidebarProps) {
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
          {linkBadgeCount(item.href, props) > 0 ? (
            <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {linkBadgeCount(item.href, props)}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
