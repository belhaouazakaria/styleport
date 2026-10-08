import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getPublicIdeaCategories, getPublicIdeasPage } from "@/lib/data/ideas";
import { getAppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SayTwist Ideas | Better Things to Say",
  description: "Practical text ideas, replies, captions, conversation starters, and examples for everyday moments.",
  alternates: { canonical: "/ideas" },
  openGraph: { title: "SayTwist Ideas", description: "Useful, original ways to say what you mean.", type: "website", url: "/ideas" },
};

interface Props { searchParams: Promise<{ category?: string; page?: string }> }

export default async function IdeasPage({ searchParams }: Props) {
  const params = await searchParams;
  const category = params.category?.trim() || undefined;
  const page = Math.max(1, Number(params.page || 1) || 1);
  const [settings, categories, result] = await Promise.all([getAppSettings(), getPublicIdeaCategories(), getPublicIdeasPage({ category, page })]);
  const pageHref = (target: number) => `/ideas?${new URLSearchParams({ ...(category ? { category } : {}), ...(target > 1 ? { page: String(target) } : {}) }).toString()}`.replace(/\?$/, "");
  return <div className="min-h-screen bg-page"><Navbar logoUrl={settings.logoUrl} logoDesktopHeight={settings.logoDesktopHeight} logoMobileHeight={settings.logoMobileHeight} /><main>
    <section className="border-b border-border bg-brand-50"><div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8"><p className="section-kicker">SayTwist Ideas</p><h1 className="font-display mt-2 max-w-4xl text-5xl font-bold tracking-tight text-ink sm:text-6xl">Better things to say, right when you need them.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-muted-ink">Useful replies, captions, conversation starters, and examples that work on their own, with a relevant translator when you want another twist.</p></div></section>
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><nav aria-label="Idea categories" className="flex flex-wrap gap-2"><Link href="/ideas" className={`rounded-full px-4 py-2 text-sm font-bold ${!category ? "bg-ink text-white" : "border border-border bg-white text-ink"}`}>All ideas</Link>{categories.map((item) => <Link key={item.id} href={`/ideas?category=${item.slug}`} className={`rounded-full px-4 py-2 text-sm font-bold ${category === item.slug ? "bg-ink text-white" : "border border-border bg-white text-ink"}`}>{item.name}</Link>)}</nav>
      {result.ideas.length ? <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{result.ideas.map((idea) => <article key={idea.id} className="flex min-h-64 flex-col rounded-[1.5rem] border border-border bg-white p-6 shadow-sm"><Link href={`/ideas?category=${idea.category.slug}`} className="text-xs font-bold uppercase tracking-wide text-brand-700">{idea.category.name}</Link><h2 className="font-display mt-3 text-2xl font-bold leading-tight text-ink"><Link href={`/ideas/${idea.slug}`}>{idea.currentVersion!.title}</Link></h2><p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-ink">{idea.currentVersion!.excerpt}</p><Link href={`/ideas/${idea.slug}`} className="mt-auto pt-6 text-sm font-bold text-accent-700">Read the idea →</Link></article>)}</div> : <div className="mt-10 rounded-[1.5rem] border border-dashed border-border p-10 text-center"><h2 className="font-display text-2xl font-bold text-ink">No ideas here yet</h2><p className="mt-2 text-muted-ink">Try another category or check back soon.</p></div>}
      {result.totalPages > 1 ? <nav aria-label="Ideas pagination" className="mt-10 flex items-center justify-center gap-3">{page > 1 ? <Link href={pageHref(page - 1)} className="rounded-full border border-border bg-white px-4 py-2 text-sm font-bold">Previous</Link> : null}<span className="text-sm text-muted-ink">Page {page} of {result.totalPages}</span>{page < result.totalPages ? <Link href={pageHref(page + 1)} className="rounded-full border border-border bg-white px-4 py-2 text-sm font-bold">Next</Link> : null}</nav> : null}
    </section>
  </main><Footer platformName={settings.platformName} /></div>;
}

