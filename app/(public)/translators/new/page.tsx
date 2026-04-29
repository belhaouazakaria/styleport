import type { Metadata } from "next";

import { DiscoveryPagination } from "@/components/public/discovery-pagination";
import { TranslatorDirectory } from "@/components/public/translator-directory";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { DISCOVERY_DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { getNewestPublicTranslatorsPage } from "@/lib/data/translators";
import { getAppSettings } from "@/lib/settings";

interface PageProps {
  searchParams: Promise<{
    page?: string;
  }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Newest Translators | What Type Of | Translator",
  description:
    "Browse the newest active translators, sorted from latest to oldest, and find fresh AI translator styles.",
  alternates: {
    canonical: "/translators/new",
  },
};

export default async function NewestTranslatorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const settings = await getAppSettings();
  const page = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = settings.discoveryPageSize || DISCOVERY_DEFAULT_PAGE_SIZE;
  const newest = await getNewestPublicTranslatorsPage({ page, pageSize });

  return (
    <div className="relative overflow-x-hidden">
      <Navbar platformName={settings.platformName} />
      <main className="pb-10">
        <section className="mx-auto w-full max-w-7xl px-4 pb-4 pt-10 sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Newest Translators
          </h1>
          <p className="mt-3 max-w-3xl text-base text-muted-ink sm:text-lg">
            Explore the latest published translators, sorted from newest to oldest.
          </p>
        </section>

        <section className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-end justify-between gap-3">
            <p className="text-sm text-muted-ink">
              {newest.total} translator{newest.total === 1 ? "" : "s"}
            </p>
          </div>

          <TranslatorDirectory translators={newest.translators} />

          <div className="mt-6">
            <DiscoveryPagination page={newest.page} totalPages={newest.totalPages} />
          </div>
        </section>
      </main>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
