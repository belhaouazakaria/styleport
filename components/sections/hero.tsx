interface HeroProps {
  title: string;
  subtitle: string;
}

export function Hero({ title, subtitle }: HeroProps) {
  return (
    <section className="relative mx-auto grid w-full max-w-7xl overflow-hidden px-4 pb-7 pt-8 sm:px-6 sm:pb-10 sm:pt-14 lg:grid-cols-[1.35fr_.65fr] lg:items-center lg:gap-16 lg:px-8">
      <div className="motion-rise relative max-w-4xl">
        <p className="section-kicker mb-3">Same words · whole new vibe</p>
        <h1 className="font-display max-w-4xl text-balance text-[clamp(2.7rem,9vw,5.6rem)] font-bold leading-[0.94] tracking-[-0.045em] text-ink">
          {title}
        </h1>
        <div className="mt-4 flex items-start gap-3 sm:mt-6">
          <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] bg-accent-500" />
          <p className="max-w-2xl text-balance text-base leading-relaxed text-muted-ink sm:text-xl">{subtitle}</p>
        </div>
      </div>
      <aside aria-hidden="true" className="relative hidden h-72 lg:block">
        <div className="twist-ribbon left-0 top-24 w-[26rem] rotate-[24deg]" />
        <div className="absolute left-4 top-3 rotate-[-4deg] rounded-[1.4rem] border-2 border-ink bg-white px-5 py-4 shadow-[6px_6px_0_#0f172a]">
          <p className="text-xs font-extrabold uppercase tracking-widest text-brand-700">Original</p>
          <p className="mt-1 font-display text-xl font-bold text-ink">“I need a fresh idea.”</p>
        </div>
        <div className="absolute bottom-4 right-2 rotate-[3deg] rounded-[1.4rem] bg-[#ffe079] px-5 py-4 shadow-[6px_6px_0_#ff7a59]">
          <p className="text-xs font-extrabold uppercase tracking-widest text-accent-700">Twisted</p>
          <p className="mt-1 font-display text-xl font-bold text-ink">“Let’s shake up the usual.”</p>
        </div>
      </aside>
    </section>
  );
}
