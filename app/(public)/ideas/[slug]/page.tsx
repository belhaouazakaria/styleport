import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";

import { IdeaBlocks } from "@/components/public/idea-blocks";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getPublicIdeaBySlug } from "@/lib/data/ideas";
import { getAppBaseUrl } from "@/lib/env";
import { getAppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const idea = await getPublicIdeaBySlug(slug);
  if (!idea) return { title: "Idea not found", robots: { index: false, follow: false } };
  const url = new URL(`/ideas/${idea.slug}`, getAppBaseUrl()).toString();
  const seoTitle = idea.currentVersion!.seoTitle;
  const seoDescription = idea.currentVersion!.seoDescription;
  return { title: seoTitle, description: seoDescription, alternates: { canonical: url }, openGraph: { title: seoTitle, description: seoDescription, type: "article", url }, twitter: { card: "summary_large_image", title: seoTitle, description: seoDescription } };
}

export default async function IdeaDetailPage({ params }: Props) {
  const { slug } = await params;
  const [idea, settings] = await Promise.all([getPublicIdeaBySlug(slug), getAppSettings()]);
  if (!idea) notFound();

  return <div className="min-h-screen bg-page"><Navbar logoUrl={settings.logoUrl} logoDesktopHeight={settings.logoDesktopHeight} logoMobileHeight={settings.logoMobileHeight} /><main>
    <article>
      <header className="relative overflow-hidden border-b border-dashed border-border"><span className="pointer-events-none absolute -right-16 top-16 h-48 w-48 rotate-12 rounded-[3.5rem] bg-supporting-100/70" aria-hidden="true" /><span className="pointer-events-none absolute right-20 top-12 hidden font-display text-[12rem] font-bold leading-none text-brand-500/[0.06] lg:block" aria-hidden="true">“</span><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16"><Breadcrumbs align="start" items={[{ label: "Home", href: "/" }, { label: "Ideas", href: "/ideas" }, { label: idea.currentVersion!.title }]} /><div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end"><div><Link href={`/ideas?category=${idea.category.slug}`} className="section-kicker">{idea.category.name}</Link><h1 className="font-display mt-3 max-w-5xl text-balance text-[clamp(2.8rem,7vw,5.8rem)] font-bold leading-[0.94] tracking-[-0.04em] text-ink">{idea.currentVersion!.title}</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-muted-ink sm:text-xl">{idea.currentVersion!.excerpt}</p></div><aside className="border-l-4 border-accent-400 pl-5"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent-700">Inside this Idea</p><p className="mt-2 text-sm leading-6 text-muted-ink">{idea.category.description}</p><Link href={`/ideas?category=${idea.category.slug}`} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-700">More in {idea.category.name}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></aside></div></div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[12rem_minmax(0,46rem)] lg:justify-center lg:px-8">
        <aside className="hidden lg:block"><div className="sticky top-24 border-l border-border pl-4"><p className="section-kicker">A useful starting point</p><p className="mt-2 text-sm leading-6 text-muted-ink">Read, borrow, and adapt. The strongest line is the one that sounds natural in your situation.</p></div></aside>
        <IdeaBlocks blocks={idea.blocks} translators={idea.translators} />
      </div>
    </article>

    {idea.related.length ? <section className="border-t border-dashed border-border"><div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="section-kicker">Keep exploring</p><h2 className="font-display mt-1 text-3xl font-bold text-ink sm:text-4xl">More useful ideas</h2></div><Link href="/ideas" className="text-sm font-bold text-brand-700">Browse all Ideas</Link></div><div className="mt-6 grid gap-4 md:grid-cols-2">{idea.related.map((related, index) => <article key={related.id} className={`group relative overflow-hidden rounded-[1.4rem] border border-border p-5 sm:p-6 ${index % 2 ? "bg-supporting-50" : "bg-white"}`}><span className={`absolute inset-y-0 left-0 w-1 ${index % 3 === 0 ? "bg-brand-500" : index % 3 === 1 ? "bg-accent-500" : "bg-supporting-500"}`} aria-hidden="true" /><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-brand-700">{related.category.name}</p><h3 className="font-display mt-3 text-2xl font-bold leading-tight text-ink"><Link href={`/ideas/${related.slug}`} className="after:absolute after:inset-0">{related.currentVersion!.title}</Link></h3><p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-ink">{related.currentVersion!.excerpt}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-accent-700">Read next <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" /></span></article>)}</div></div></section> : null}
  </main><Footer platformName={settings.platformName} /></div>;
}
