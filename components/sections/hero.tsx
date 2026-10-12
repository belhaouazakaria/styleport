interface HeroProps {
  title: string;
  subtitle: string;
}

export function Hero({ title, subtitle }: HeroProps) {
  return (
    <section className="relative mx-auto grid w-full max-w-7xl overflow-hidden px-4 pt-6 pb-5 sm:px-6 sm:pt-14 sm:pb-10 lg:grid-cols-[1.35fr_.65fr] lg:items-center lg:gap-16 lg:px-8">
      <div className="motion-rise relative max-w-4xl">
        <p className="section-kicker mb-3">Same words · whole new vibe</p>
        <h1 className="font-display text-ink max-w-4xl text-[clamp(2.45rem,9vw,5.6rem)] leading-[0.94] font-bold tracking-[-0.045em] text-balance">
          {title}
        </h1>
        <div className="mt-4 flex items-start gap-3 sm:mt-6">
          <span
            aria-hidden="true"
            className="bg-accent-500 mt-2 h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]"
          />
          <p className="text-muted-ink max-w-2xl text-base leading-relaxed text-balance sm:text-xl">
            {subtitle}
          </p>
        </div>
      </div>
      <aside aria-hidden="true" className="relative hidden h-72 lg:block">
        <div className="twist-ribbon top-24 left-0 w-[26rem] rotate-[24deg]" />
        <div className="border-ink absolute top-3 left-4 rotate-[-4deg] rounded-[1.4rem] border-2 bg-white px-5 py-4 shadow-[6px_6px_0_#0f172a]">
          <p className="text-brand-700 text-xs font-extrabold tracking-widest uppercase">
            Original
          </p>
          <p className="font-display text-ink mt-1 text-xl font-bold">
            “I need a fresh idea.”
          </p>
        </div>
        <div className="absolute right-2 bottom-4 rotate-[3deg] rounded-[1.4rem] bg-[#ffe079] px-5 py-4 shadow-[6px_6px_0_#ff7a59]">
          <p className="text-accent-700 text-xs font-extrabold tracking-widest uppercase">
            Twisted
          </p>
          <p className="font-display text-ink mt-1 text-xl font-bold">
            “Let’s shake up the usual.”
          </p>
        </div>
      </aside>
    </section>
  );
}
