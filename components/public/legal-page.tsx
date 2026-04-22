import type { ReactNode } from "react";

interface LegalPageProps {
  title: string;
  intro: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalPage({ title, intro, lastUpdated, children }: LegalPageProps) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-4xl font-semibold text-ink sm:text-5xl">{title}</h1>
        <p className="mt-3 text-base text-muted-ink sm:text-lg">{intro}</p>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-ink">
          Last updated: {lastUpdated}
        </p>
      </header>

      <article className="space-y-6 text-sm leading-7 text-ink [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-ink [&_p]:text-muted-ink">
        {children}
      </article>
    </main>
  );
}
