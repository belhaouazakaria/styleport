import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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

const accents = [
  { bar: "bg-brand-500", wash: "bg-brand-50", ink: "text-brand-800", shape: "bg-brand-200" },
  { bar: "bg-accent-500", wash: "bg-[#fff3ee]", ink: "text-[#b63f22]", shape: "bg-accent-200" },
  { bar: "bg-supporting-500", wash: "bg-supporting-50", ink: "text-supporting-800", shape: "bg-supporting-200" },
  { bar: "bg-[#f2b441]", wash: "bg-[#fff8df]", ink: "text-[#805000]", shape: "bg-[#ffe49a]" },
];

export default async function IdeasPage({ searchParams }: Props) {
  const params = await searchParams;
  const category = params.category?.trim() || undefined;
  const page = Math.max(1, Number(params.page || 1) || 1);
  const [settings, categories, result] = await Promise.all([getAppSettings(), getPublicIdeaCategories(), getPublicIdeasPage({ category, page })]);
  const pageHref = (target: number) => `/ideas?${new URLSearchParams({ ...(category ? { category } : {}), ...(target > 1 ? { page: String(target) } : {}) }).toString()}`.replace(/\?$/, "");
  const activeCategory = categories.find((item) => item.slug === category);

  return <div className="min-h-screen bg-page"><Navbar logoUrl={settings.logoUrl} logoDesktopHeight={settings.logoDesktopHeight} logoMobileHeight={settings.logoMobileHeight} /><main>
    <section className="relative overflow-hidden border-b border-dashed border-border"><div className="twist-ribbon -right-28 top-12 hidden lg:block" /><div className="pointer-events-none absolute -left-10 bottom-8 h-32 w-32 rotate-12 rounded-[2.5rem] bg-supporting-100/75" aria-hidden="true" /><div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_0.36fr] lg:px-8 lg:py-20"><div className="relative"><p className="section-kicker">SayTwist Ideas</p><h1 className="font-display mt-3 max-w-4xl text-balance text-[clamp(3rem,8vw,6.4rem)] font-bold leading-[0.9] tracking-[-0.045em] text-ink">Better things<br className="hidden sm:block" /> to say.</h1><p className="mt-6 max-w-2xl text-base leading-7 text-muted-ink sm:text-lg sm:leading-8">Practical replies, captions, conversation starters, and examples for the moments when the right words need a little twist.</p></div><aside className="relative self-end border-l-4 border-accent-400 pl-5 lg:mb-2"><p className="font-display text-xl font-bold text-ink">Ideas meet Translators</p><p className="mt-2 text-sm leading-6 text-muted-ink">Start with a useful line. When you want to make it sound more like you, continue with a relevant SayTwist Translator.</p><Link href="/translators" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900">Browse every voice <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></aside></div></section>

    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="section-kicker">Find your moment</p><h2 className="font-display mt-1 text-2xl font-bold text-ink">Browse by category</h2></div><p className="text-sm text-muted-ink">{result.total} idea{result.total === 1 ? "" : "s"}{activeCategory ? ` in ${activeCategory.name}` : " to explore"}</p></div>
      <nav aria-label="Idea categories" className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 py-5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"><Link href="/ideas" aria-current={!category ? "page" : undefined} className={`min-w-fit snap-start rounded-xl border-l-4 px-4 py-3 text-sm font-bold transition ${!category ? "border-ink bg-ink text-white" : "border-brand-400 bg-white text-ink hover:bg-brand-50"}`}>All ideas</Link>{categories.map((item, index) => { const accent = accents[index % accents.length]; const selected = category === item.slug; return <Link key={item.id} href={`/ideas?category=${item.slug}`} aria-current={selected ? "page" : undefined} className={`min-w-[10rem] snap-start rounded-xl border-l-4 px-4 py-3 transition hover:-translate-y-0.5 ${selected ? `${accent.bar} border-ink text-white` : `border-current bg-white ${accent.ink}`}`}><span className="block text-sm font-bold">{item.name}</span><span className={`mt-0.5 block max-w-44 truncate text-[11px] font-medium ${selected ? "text-white/75" : "text-muted-ink"}`}>{item.description}</span></Link>; })}</nav>

      {result.ideas.length ? <div className="mt-4 grid auto-rows-auto gap-5 md:grid-cols-2 lg:grid-cols-12">{result.ideas.map((idea, index) => { const categoryIndex = categories.findIndex((item) => item.slug === idea.category.slug); const accent = accents[categoryIndex >= 0 ? categoryIndex % accents.length : index % accents.length]; const feature = index % 7 === 0; const wide = index % 7 === 3; return <article key={idea.id} className={`group relative isolate min-h-64 overflow-hidden rounded-[1.6rem] border border-border bg-white p-6 transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)] md:p-7 ${feature ? "lg:col-span-7 lg:min-h-96" : wide ? "lg:col-span-7" : "lg:col-span-5"}`}><span className={`absolute inset-x-0 top-0 h-1.5 ${accent.bar}`} aria-hidden="true" /><span className={`absolute -right-12 -top-12 -z-10 h-36 w-36 rotate-12 rounded-[2.5rem] opacity-45 transition group-hover:rotate-6 ${accent.shape}`} aria-hidden="true" /><span className={`font-display absolute right-5 top-3 -z-10 text-8xl font-bold opacity-[0.07] ${accent.ink}`} aria-hidden="true">{idea.category.name.charAt(0)}</span><div className="flex h-full flex-col"><Link href={`/ideas?category=${idea.category.slug}`} className={`relative z-10 w-fit text-xs font-extrabold uppercase tracking-[0.12em] ${accent.ink}`}>{idea.category.name}</Link><h2 className={`font-display mt-5 max-w-xl text-balance font-bold leading-[1.05] tracking-tight text-ink ${feature ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"}`}><Link href={`/ideas/${idea.slug}`} className="after:absolute after:inset-0">{idea.currentVersion!.title}</Link></h2><p className={`mt-4 max-w-xl leading-7 text-muted-ink ${feature ? "text-base" : "line-clamp-3 text-sm"}`}>{idea.currentVersion!.excerpt}</p><div className="mt-auto flex items-center justify-between gap-4 pt-8"><span className="text-sm font-bold text-accent-700">Open the idea</span><span className={`flex h-10 w-10 items-center justify-center rounded-full transition group-hover:translate-x-1 ${accent.wash} ${accent.ink}`}><ArrowRight className="h-4 w-4" aria-hidden="true" /></span></div></div></article>; })}</div> : <div className="mt-8 rounded-[1.5rem] border border-dashed border-border bg-white/40 p-10 text-center"><p className="section-kicker">A quiet shelf</p><h2 className="font-display mt-2 text-2xl font-bold text-ink">No ideas here yet</h2><p className="mt-2 text-muted-ink">Try another category or check back soon.</p><Link href="/ideas" className="mt-5 inline-flex text-sm font-bold text-brand-700">Browse all ideas</Link></div>}

      {result.totalPages > 1 ? <nav aria-label="Ideas pagination" className="mt-10 flex items-center justify-center gap-3 border-t border-dashed border-border pt-8">{page > 1 ? <Link href={pageHref(page - 1)} className="rounded-full border border-border bg-white px-4 py-2 text-sm font-bold hover:bg-muted-surface">Previous</Link> : null}<span className="text-sm font-medium text-muted-ink">Page {page} of {result.totalPages}</span>{page < result.totalPages ? <Link href={pageHref(page + 1)} className="rounded-full border border-border bg-white px-4 py-2 text-sm font-bold hover:bg-muted-surface">Next</Link> : null}</nav> : null}
    </section>
  </main><Footer platformName={settings.platformName} /></div>;
}
