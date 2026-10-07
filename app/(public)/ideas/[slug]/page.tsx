import type { Metadata } from "next";
import Link from "next/link";
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
  return { title: idea.seoTitle, description: idea.seoDescription, alternates: { canonical: url }, openGraph: { title: idea.seoTitle, description: idea.seoDescription, type: "article", url }, twitter: { card: "summary_large_image", title: idea.seoTitle, description: idea.seoDescription } };
}

export default async function IdeaDetailPage({ params }: Props) {
  const { slug } = await params;
  const [idea, settings] = await Promise.all([getPublicIdeaBySlug(slug), getAppSettings()]);
  if (!idea) notFound();
  return <div className="min-h-screen bg-page"><Navbar logoUrl={settings.logoUrl} logoDesktopHeight={settings.logoDesktopHeight} logoMobileHeight={settings.logoMobileHeight} /><main>
    <article><header className="border-b border-border bg-brand-50"><div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Ideas", href: "/ideas" }, { label: idea.currentVersion!.title }]} /><Link href={`/ideas?category=${idea.category.slug}`} className="mt-7 inline-block text-xs font-bold uppercase tracking-wide text-brand-700">{idea.category.name}</Link><h1 className="font-display mt-3 text-balance text-4xl font-bold leading-tight tracking-tight text-ink sm:text-6xl">{idea.currentVersion!.title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-muted-ink">{idea.currentVersion!.excerpt}</p></div></header>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8"><IdeaBlocks blocks={idea.blocks} translators={idea.translators} /></div>
    </article>
    {idea.related.length ? <section className="mx-auto max-w-7xl border-t border-dashed border-border px-4 py-10 sm:px-6 lg:px-8"><h2 className="font-display text-3xl font-bold text-ink">More useful ideas</h2><div className="mt-5 grid gap-4 md:grid-cols-2">{idea.related.map((related) => <article key={related.id} className="rounded-2xl border border-border bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">{related.category.name}</p><h3 className="font-display mt-2 text-xl font-bold text-ink"><Link href={`/ideas/${related.slug}`}>{related.currentVersion!.title}</Link></h3><p className="mt-2 text-sm leading-6 text-muted-ink">{related.currentVersion!.excerpt}</p></article>)}</div></section> : null}
  </main><Footer platformName={settings.platformName} /></div>;
}

