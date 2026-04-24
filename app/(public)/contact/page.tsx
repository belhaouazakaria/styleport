import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/components/public/contact-form";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact the StylePort team for support, partnership requests, bug reports, or privacy and policy questions.",
};

export default async function ContactPage() {
  const settings = await getAppSettings();
  const contactEmail = "translator@whattypeof.com";

  return (
    <div className="relative overflow-x-hidden">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="font-display text-4xl font-semibold text-ink sm:text-5xl">Contact</h1>
          <p className="mt-3 max-w-3xl text-base text-muted-ink sm:text-lg">
            We&apos;d love to hear from you. Use the form below for support, legal requests, feedback, or partnerships.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <ContactForm />
          <aside className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">General Email</p>
              <a href={`mailto:${contactEmail}`} className="mt-1 inline-block text-sm font-medium text-brand-700">
                {contactEmail}
              </a>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">Response Time</p>
              <p className="mt-1 text-sm text-muted-ink">Most messages receive a response within 1-2 business days.</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">Useful Links</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-ink">
                <li>
                  <Link className="text-brand-700 hover:text-brand-800" href="/privacy">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link className="text-brand-700 hover:text-brand-800" href="/terms">
                    Terms of Use
                  </Link>
                </li>
                <li>
                  <Link className="text-brand-700 hover:text-brand-800" href="/disclaimer">
                    Disclaimer
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
