import type { Metadata } from "next";

import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "About SayTwist",
  description:
    "Learn how SayTwist helps you reshape writing with focused translators for tone, voice, personality, and creative expression.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const settings = await getAppSettings();

  return (
    <div className="relative overflow-x-hidden">
      <Navbar logoUrl={settings.logoUrl} logoDesktopHeight={settings.logoDesktopHeight} logoMobileHeight={settings.logoMobileHeight} />
      <main className="pb-16">
        <section className="mx-auto w-full max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:px-8">
          <p className="section-kicker">A little more context</p>
          <h1 className="font-display mt-2 max-w-4xl text-balance text-5xl font-bold leading-tight tracking-[-0.04em] text-ink sm:text-6xl">
            SayTwist helps ordinary words find a more useful voice.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-ink">
            SayTwist is a collection of focused AI translators for rewriting text into different tones, personalities,
            and styles without losing the meaning underneath.
          </p>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          <article className="rounded-[1.5rem] border border-brand-200 bg-brand-50 p-6 sm:p-7">
            <p className="section-kicker">What is a twist?</p>
            <h2 className="font-display mt-2 text-2xl font-bold text-ink">A deliberate change in expression.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-ink">
              A twist keeps the core idea while changing how it sounds: warmer, sharper, more playful, more concise, or
              better suited to a particular audience.
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-border bg-white p-6 sm:p-7">
            <p className="section-kicker">How it works</p>
            <h2 className="font-display mt-2 text-2xl font-bold text-ink">Pick a translator, then bring your draft.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-ink">
              Each translator has its own instructions and editorial guidance. Paste text, choose an optional mode when
              one is available, and review the result before you use it.
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-border bg-[#fff0c7] p-6 sm:p-7">
            <p className="section-kicker">The product philosophy</p>
            <h2 className="font-display mt-2 text-2xl font-bold text-ink">Useful first. Expressive second.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-ink">
              Good rewriting should make a message clearer or more appropriate, not just louder. SayTwist is built for
              experimentation with enough context to help people choose the right voice.
            </p>
          </article>
        </section>

        <section className="mx-auto mt-10 w-full max-w-4xl border-y border-dashed border-border px-4 py-9 sm:px-6 lg:px-8">
          <p className="section-kicker">Where it can help</p>
          <h2 className="font-display mt-2 text-3xl font-bold tracking-tight text-ink">One idea, several possible homes.</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              ["A clearer work message", "Turn a rough note into something direct and easy to act on."],
              ["A friendlier invitation", "Keep the details while making the tone warmer and more welcoming."],
              ["A playful social caption", "Explore a lighter voice when the moment calls for personality."],
              ["A concise first draft", "Trim repetition and find a cleaner starting point for your own edit."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-xl border border-border bg-surface p-4">
                <h3 className="font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-ink">{description}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-7 text-muted-ink">
            SayTwist outputs are starting points, not a substitute for judgment. Read the result, check the facts, and
            make the final call about what represents you.
          </p>
        </section>
      </main>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
