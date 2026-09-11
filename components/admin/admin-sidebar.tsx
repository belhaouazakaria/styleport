"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Cog,
  FolderTree,
  Globe,
  LayoutTemplate,
  Menu,
  MessageCircleMore,
  MessageSquareText,
  PlusSquare,
  ScrollText,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

import { BrandLogo } from "@/components/shared/brand-logo";

interface AdminSidebarProps {
  pendingRequestCount: number;
  pendingCommentCount: number;
  logoUrl?: string;
  logoDesktopHeight?: number;
  logoMobileHeight?: number;
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
  const pathname = usePathname();
  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-ink p-5 text-white lg:block">
      <Link href="/admin" className="mb-8 flex items-center gap-2 rounded-2xl bg-white p-3">
        <BrandLogo
          logoUrl={props.logoUrl}
          desktopHeight={props.logoDesktopHeight}
          mobileHeight={props.logoMobileHeight}
        />
        <p className="text-xs text-white/50">Studio</p>
      </Link>

      <nav className="space-y-1">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${pathname === item.href ? "bg-brand-500 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`}
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
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <nav className="sticky top-0 z-40 flex h-[4.5rem] items-center justify-between border-b border-border bg-page/95 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/admin" aria-label="Admin overview">
          <BrandLogo logoUrl={props.logoUrl} desktopHeight={props.logoDesktopHeight} mobileHeight={props.logoMobileHeight} />
        </Link>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white shadow-sm" aria-label="Open admin navigation">
          <Menu className="h-5 w-5" />
        </button>
      </nav>
      {open ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button type="button" className="absolute inset-0 bg-ink/45 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close admin navigation" />
          <aside className="absolute inset-y-0 right-0 w-[88vw] max-w-sm overflow-y-auto bg-ink p-5 text-white shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <p className="font-display text-2xl font-bold">SayTwist Studio</p>
              <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10" aria-label="Close admin navigation"><X className="h-5 w-5" /></button>
            </div>
            <nav className="space-y-1" aria-label="Admin navigation">
              {links.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold ${pathname === item.href ? "bg-brand-500 text-white" : "text-white/70 hover:bg-white/10"}`}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {linkBadgeCount(item.href, props) > 0 ? <span className="ml-auto rounded-full bg-accent-500 px-2 py-0.5 text-xs text-white">{linkBadgeCount(item.href, props)}</span> : null}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
