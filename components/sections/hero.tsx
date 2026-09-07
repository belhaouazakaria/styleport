interface HeroProps {
  title: string;
  subtitle: string;
}

export function Hero({ title, subtitle }: HeroProps) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-6 pt-10 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#14B8A6]">
          <svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 22C8 22 7 20 8 17C9.5 12 14 10 17 10C20 10 23 11 24 14C25 17 24 20 22 22C20 24 16 25 13 24C10 23 9 22 8 22Z" fill="white"/>
            <path d="M10 23L8 27L13 24.5" fill="white"/>
            <rect x="5" y="4" width="3" height="2" rx="1" transform="rotate(-30 5 4)" fill="#FF7A59"/>
            <rect x="11" y="2.5" width="3" height="2" rx="1" transform="rotate(-10 11 2.5)" fill="#F59E0B"/>
            <rect x="17" y="4" width="2.5" height="2" rx="1" transform="rotate(15 17 4)" fill="#60C5F7"/>
          </svg>
        </span>
        <span className="text-sm font-semibold text-[#14B8A6]">SayTwist</span>
      </div>
      <h1 className="font-display mt-2 text-balance text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-3xl text-balance text-base text-[#64748B] sm:text-lg leading-relaxed">{subtitle}</p>
    </section>
  );
}
