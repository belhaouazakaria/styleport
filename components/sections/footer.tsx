import Link from "next/link";

interface FooterProps {
  platformName: string;
}

export function Footer({ platformName }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-border bg-ink py-12 text-white">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-2xl font-bold text-white">{platformName}</p>
            <p className="mt-2 text-sm text-white/65">
              Discover and use AI translators for tone, voice, and creative rewriting.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/45">Explore</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/" className="text-white/80 transition hover:text-brand-300">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/translators" className="text-white/80 transition hover:text-brand-300">
                  Translators
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/45">Legal</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="text-white/80 transition hover:text-brand-300">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-white/80 transition hover:text-brand-300">
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link href="/disclaimer" className="text-white/80 transition hover:text-brand-300">
                  Disclaimer
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="text-white/80 transition hover:text-brand-300">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/45">Support</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/contact" className="text-white/80 transition hover:text-brand-300">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-white/45">
          <span>© {year} {platformName}. All rights reserved.</span>
          <span className="text-right text-[0.7rem] leading-relaxed text-white/45">
            Made with <span aria-hidden="true" className="mx-0.5 text-brand-300">♥</span> for curious minds
          </span>
        </div>
      </div>
    </footer>
  );
}
