import Link from "next/link";

interface FooterProps {
  platformName: string;
}

export function Footer({ platformName }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-white/70 py-10">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-xl font-semibold text-ink">{platformName}</p>
            <p className="mt-2 text-sm text-muted-ink">
              Discover and use AI translators for tone, voice, and creative rewriting.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">Explore</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/" className="text-ink transition hover:text-brand-700">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/translators" className="text-ink transition hover:text-brand-700">
                  Translators
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">Legal</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="text-ink transition hover:text-brand-700">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-ink transition hover:text-brand-700">
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link href="/disclaimer" className="text-ink transition hover:text-brand-700">
                  Disclaimer
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="text-ink transition hover:text-brand-700">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">Support</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/contact" className="text-ink transition hover:text-brand-700">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/admin" className="text-ink transition hover:text-brand-700">
                  Admin
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-4 text-xs text-muted-ink">
          (c) {year} {platformName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
