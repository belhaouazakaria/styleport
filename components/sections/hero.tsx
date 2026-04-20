interface HeroProps {
  title: string;
  subtitle: string;
}

export function Hero({ title, subtitle }: HeroProps) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-6 pt-10 sm:px-6 lg:px-8">
      <p className="text-sm font-medium text-brand-700">Translator Discovery</p>
      <h1 className="font-display mt-2 text-balance text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-balance text-base text-muted-ink sm:text-lg">{subtitle}</p>
    </section>
  );
}
