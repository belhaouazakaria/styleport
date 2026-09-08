interface HeroProps {
  title: string;
  subtitle: string;
}

export function Hero({ title, subtitle }: HeroProps) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-6 pt-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-balance text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-3xl text-balance text-base text-[#64748B] sm:text-lg leading-relaxed">{subtitle}</p>
    </section>
  );
}
