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
      <Navbar
        logoUrl={settings.logoUrl}
        logoDesktopHeight={settings.logoDesktopHeight}
        logoMobileHeight={settings.logoMobileHeight}
      />
      <main className="pb-16">
        <section className="mx-auto w-full max-w-7xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:px-8">
          <p className="section-kicker">A little more context</p>
          <h1 className="font-display text-ink mt-2 max-w-4xl text-5xl leading-tight font-bold tracking-[-0.04em] text-balance sm:text-6xl">
            SayTwist helps ordinary words find a more useful voice.
          </h1>
          <p className="text-muted-ink mt-5 max-w-2xl text-lg leading-8">
            SayTwist is a collection of focused AI translators for rewriting
            text into different tones, personalities, and styles without losing
            the meaning underneath.
          </p>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          <article className="border-brand-200 bg-brand-50 rounded-[1.5rem] border p-6 sm:p-7">
            <p className="section-kicker">What is a twist?</p>
            <h2 className="font-display text-ink mt-2 text-2xl font-bold">
              A deliberate change in expression.
            </h2>
            <p className="text-muted-ink mt-3 text-sm leading-7">
              A twist keeps the core idea while changing how it sounds: warmer,
              sharper, more playful, more concise, or better suited to a
              particular audience.
            </p>
          </article>
          <article className="border-border rounded-[1.5rem] border bg-white p-6 sm:p-7">
            <p className="section-kicker">How it works</p>
            <h2 className="font-display text-ink mt-2 text-2xl font-bold">
              Pick a translator, then bring your draft.
            </h2>
            <p className="text-muted-ink mt-3 text-sm leading-7">
              Each translator has its own instructions and editorial guidance.
              Paste text, choose an optional mode when one is available, and
              review the result before you use it.
            </p>
          </article>
          <article className="border-border rounded-[1.5rem] border bg-[#fff0c7] p-6 sm:p-7">
            <p className="section-kicker">The product philosophy</p>
            <h2 className="font-display text-ink mt-2 text-2xl font-bold">
              Useful first. Expressive second.
            </h2>
            <p className="text-muted-ink mt-3 text-sm leading-7">
              Good rewriting should make a message clearer or more appropriate,
              not just louder. SayTwist is built for experimentation with enough
              context to help people choose the right voice.
            </p>
          </article>
        </section>

        <section className="border-border mx-auto mt-10 w-full max-w-4xl border-y border-dashed px-4 py-9 sm:px-6 lg:px-8">
          <p className="section-kicker">Where it can help</p>
          <h2 className="font-display text-ink mt-2 text-3xl font-bold tracking-tight">
            One idea, several possible homes.
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              [
                "A clearer work message",
                "Turn a rough note into something direct and easy to act on.",
              ],
              [
                "A friendlier invitation",
                "Keep the details while making the tone warmer and more welcoming.",
              ],
              [
                "A playful social caption",
                "Explore a lighter voice when the moment calls for personality.",
              ],
              [
                "A concise first draft",
                "Trim repetition and find a cleaner starting point for your own edit.",
              ],
            ].map(([title, description]) => (
              <div
                key={title}
                className="border-border bg-surface rounded-xl border p-4"
              >
                <h3 className="text-ink font-semibold">{title}</h3>
                <p className="text-muted-ink mt-1 text-sm leading-6">
                  {description}
                </p>
              </div>
            ))}
          </div>
          <p className="text-muted-ink mt-6 text-sm leading-7">
            SayTwist outputs are starting points, not a substitute for judgment.
            Read the result, check the facts, and make the final call about what
            represents you.
          </p>
        </section>

        <section className="mx-auto mt-10 w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <p className="section-kicker">Choose the right voice</p>
          <h2 className="font-display text-ink mt-2 max-w-3xl text-3xl font-bold tracking-tight">
            Three questions before you rewrite
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              [
                "Who will read it?",
                "A playful caption and a customer complaint need different levels of clarity, formality, and restraint.",
              ],
              [
                "What must stay exact?",
                "Names, dates, prices, instructions, and promises should survive the tone change word for word when accuracy matters.",
              ],
              [
                "What should they do next?",
                "A successful rewrite makes the next action easier to understand instead of burying it beneath style.",
              ],
            ].map(([title, description], index) => (
              <article
                key={title}
                className="border-border rounded-[1.35rem] border bg-white p-5"
              >
                <span className="font-display text-accent-700 text-sm font-bold">
                  0{index + 1}
                </span>
                <h3 className="font-display text-ink mt-2 text-xl font-bold">
                  {title}
                </h3>
                <p className="text-muted-ink mt-2 text-sm leading-6">
                  {description}
                </p>
              </article>
            ))}
          </div>
          <div className="border-accent-500 mt-5 rounded-[1.35rem] border-l-4 bg-[#fff0c7] p-5 sm:p-6">
            <h3 className="font-display text-ink text-xl font-bold">
              When not to rely on a twist alone
            </h3>
            <p className="text-ink/75 mt-2 text-sm leading-7">
              AI rewriting can miss context, soften an important warning, or
              introduce an inaccurate detail. Do not rely on an unreviewed
              result for legal, medical, financial, safety-critical, emergency,
              or high-stakes workplace communication. Keep the source, compare
              the result, verify every fact, and ask an appropriately qualified
              person when the consequences matter.
            </p>
          </div>
        </section>
      </main>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
