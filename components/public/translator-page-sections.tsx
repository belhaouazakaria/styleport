import type { ReactNode } from "react";

import { TranslatorFaq } from "@/components/public/translator-faq";
import type { AccentKey, ExamplesStyle, PageLayout, SectionKey, UsesStyle } from "@/lib/translator-page-layout";
import type { TranslatorPage } from "@/lib/translator-page";
import type { TranslatorEditorialContent } from "@/lib/types";

/* Literal class names so Tailwind can see every palette. */
const ACCENTS: Record<AccentKey, { soft: string; border: string; text: string; solid: string; bar: string; chip: string }> = {
  teal: { soft: "bg-teal-50", border: "border-teal-200", text: "text-teal-800", solid: "bg-teal-600", bar: "bg-teal-500", chip: "bg-teal-100 text-teal-900" },
  coral: { soft: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", solid: "bg-orange-600", bar: "bg-orange-500", chip: "bg-orange-100 text-orange-900" },
  violet: { soft: "bg-violet-50", border: "border-violet-200", text: "text-violet-800", solid: "bg-violet-600", bar: "bg-violet-500", chip: "bg-violet-100 text-violet-900" },
  amber: { soft: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", solid: "bg-amber-600", bar: "bg-amber-500", chip: "bg-amber-100 text-amber-900" },
  sky: { soft: "bg-sky-50", border: "border-sky-200", text: "text-sky-800", solid: "bg-sky-600", bar: "bg-sky-500", chip: "bg-sky-100 text-sky-900" },
  rose: { soft: "bg-rose-50", border: "border-rose-200", text: "text-rose-800", solid: "bg-rose-600", bar: "bg-rose-500", chip: "bg-rose-100 text-rose-900" },
};

const FACT_COLS: Record<number, string> = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" };

const WRAP = "mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8";

function Heading({ children, kicker, accent }: { children: ReactNode; kicker?: string; accent: AccentKey }) {
  return (
    <>
      {kicker ? <p className={`text-xs font-extrabold uppercase tracking-[0.14em] ${ACCENTS[accent].text}`}>{kicker}</p> : null}
      <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-ink">{children}</h2>
    </>
  );
}

export interface TranslatorPageSectionsProps {
  page: TranslatorPage;
  layout: PageLayout;
  editorial: TranslatorEditorialContent;
}

export function TranslatorPageSections({ page, layout, editorial }: TranslatorPageSectionsProps) {
  const a = layout.accent;
  const c = ACCENTS[a];
  const h = page.headings;

  const render: Record<SectionKey, () => ReactNode> = {
    facts: () => (
      <section className={WRAP} aria-label="Quick facts">
        {layout.factsStyle === "strip" ? (
          <dl className={`grid gap-px overflow-hidden rounded-2xl border ${c.border} bg-white ${FACT_COLS[Math.min(page.quickFacts.length, 5)]}`}>
            {page.quickFacts.map((fact) => (
              <div key={fact.label} className={`${c.soft} p-4`}>
                <dt className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${c.text}`}>{fact.label}</dt>
                <dd className="mt-1 text-sm font-semibold leading-5 text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <dl className="flex flex-wrap gap-2">
            {page.quickFacts.map((fact) => (
              <div key={fact.label} className={`rounded-full border ${c.border} ${c.soft} px-4 py-2 text-sm`}>
                <dt className={`inline text-[11px] font-extrabold uppercase tracking-wide ${c.text}`}>{fact.label}: </dt>
                <dd className="inline font-semibold text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    ),

    whatItDoes: () =>
      editorial.whatItDoes ? (
        <section className={WRAP}>
          <div className={`border-l-4 ${c.border} py-1 pl-5 sm:pl-7`}>
            <Heading accent={a}>{h.whatItDoes}</Heading>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-ink">{editorial.whatItDoes}</p>
          </div>
        </section>
      ) : null,

    examples: () =>
      editorial.examples.length ? (
        <section className={WRAP}>
          <Heading accent={a}>{h.examples}</Heading>
          <ExampleList style={layout.examplesStyle} accent={a} items={editorial.examples.map((e) => ({ title: e.contextTitle || "", input: e.originalText, output: e.transformedText }))} />
        </section>
      ) : null,

    situations: () =>
      page.situations?.length ? (
        <section className={WRAP}>
          <Heading accent={a} kicker="Real outputs">{h.examples === h.whatItDoes ? "In practice" : "Situations, run through the translator"}</Heading>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {page.situations.map((item) => (
              <article key={item.title} className={`flex flex-col rounded-2xl border ${c.border} bg-white p-5`}>
                <h3 className={`font-display text-lg font-bold ${c.text}`}>{item.title}</h3>
                <p className="mt-3 text-xs font-extrabold uppercase tracking-wide text-muted-ink">You write</p>
                <p className="mt-1 break-words text-sm leading-6 text-muted-ink">{item.input}</p>
                <p className={`mt-4 text-xs font-extrabold uppercase tracking-wide ${c.text}`}>You get</p>
                <p className="mt-1 break-words text-sm font-medium leading-6 text-ink">{item.output}</p>
                {item.note ? <p className={`mt-4 rounded-lg ${c.soft} p-3 text-xs leading-5 text-ink/80`}>{item.note}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null,

    ladder: () =>
      page.ladder ? (
        <section className={WRAP}>
          <div className={`rounded-[1.6rem] border ${c.border} ${c.soft} p-5 sm:p-7`}>
            <Heading accent={a} kicker="Same sentence, different settings">{h.examples === h.whatItDoes ? "Turn the dial" : "One sentence, every setting"}</Heading>
            <p className="mt-3 rounded-xl bg-white p-4 text-sm leading-6 text-muted-ink">
              <span className="mr-2 text-[11px] font-extrabold uppercase tracking-wide text-ink">Input</span>
              {page.ladder.input}
            </p>
            <ol className="mt-4 space-y-3">
              {page.ladder.steps.map((step, index) => (
                <li key={step.label} className="flex gap-3">
                  <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${c.solid} text-xs font-bold text-white`}>{index + 1}</span>
                  <div className="min-w-0 flex-1 rounded-xl bg-white p-4">
                    <p className={`text-xs font-extrabold uppercase tracking-wide ${c.text}`}>{step.label}</p>
                    <p className="mt-1 break-words text-sm font-medium leading-6 text-ink">{step.output}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null,

    glossary: () =>
      page.glossary?.length ? (
        <section className={WRAP}>
          <Heading accent={a} kicker="Word map">{page.archetype === "code" || page.archetype === "emoji" ? "What maps to what" : "What changes, word by word"}</Heading>
          <div className={`mt-5 overflow-hidden rounded-2xl border ${c.border} bg-white`}>
            <table className="w-full text-left text-sm">
              <thead className={`${c.soft} ${c.text}`}>
                <tr>
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wide">Plain</th>
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wide">Becomes</th>
                  <th className="hidden px-4 py-3 text-xs font-extrabold uppercase tracking-wide sm:table-cell">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {page.glossary.map((row) => (
                  <tr key={`${row.from}-${row.to}`}>
                    <td className="px-4 py-3 align-top text-muted-ink">{row.from}</td>
                    <td className="px-4 py-3 align-top font-semibold text-ink">{row.to}</td>
                    <td className="hidden px-4 py-3 align-top text-xs leading-5 text-muted-ink sm:table-cell">{row.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null,

    script: () =>
      page.script ? (
        <section className={WRAP}>
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Heading accent={a} kicker={page.script.name}>Script, sounds and what to expect</Heading>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-ink">
                {page.script.notes.map((note) => (
                  <li key={note} className="flex gap-2"><span className={c.text} aria-hidden="true">●</span><span>{note}</span></li>
                ))}
              </ul>
            </div>
            <div className={`overflow-hidden rounded-2xl border ${c.border} bg-white`}>
              <table className="w-full text-left text-sm">
                <thead className={`${c.soft} ${c.text}`}>
                  <tr>
                    <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wide">English</th>
                    <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wide">{page.script.name}</th>
                    <th className="hidden px-4 py-3 text-xs font-extrabold uppercase tracking-wide sm:table-cell">Sounds like</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {page.script.phrases.map((row) => (
                    <tr key={row.english}>
                      <td className="px-4 py-3 align-top text-muted-ink">{row.english}</td>
                      <td className="px-4 py-3 align-top font-semibold text-ink">{row.target}</td>
                      <td className="hidden px-4 py-3 align-top text-xs text-muted-ink sm:table-cell">{row.romanized || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-4 py-2 text-[11px] leading-4 text-muted-ink">Phrases are AI-generated and not verified by native speakers.</p>
            </div>
          </div>
        </section>
      ) : null,

    origin: () =>
      page.origin ? (
        <section className={WRAP}>
          <figure className={`rounded-2xl ${c.soft} p-6 sm:p-8`}>
            <figcaption className={`text-xs font-extrabold uppercase tracking-[0.14em] ${c.text}`}>Where this voice comes from</figcaption>
            <p className="mt-2 max-w-3xl text-base leading-7 text-ink/85">{page.origin}</p>
          </figure>
        </section>
      ) : null,

    about: () =>
      editorial.about ? (
        <section className={WRAP}>
          <article className="max-w-3xl">
            <Heading accent={a}>{h.about}</Heading>
            <p className="mt-3 whitespace-pre-line text-base leading-7 text-muted-ink">{editorial.about}</p>
          </article>
        </section>
      ) : null,

    uses: () => (editorial.bestUses.length ? <UsesBlock style={layout.usesStyle} accent={a} heading={h.bestUses} items={editorial.bestUses.map((i) => i.content)} /> : null),

    steps: () =>
      editorial.howToUse.length ? (
        <section className={WRAP}>
          <Heading accent={a}>{h.howToUse}</Heading>
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            {editorial.howToUse.map((item, index) => (
              <li key={item.sortOrder} className={`rounded-2xl border ${c.border} bg-white p-4`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${c.solid} text-sm font-bold text-white`}>{index + 1}</span>
                <p className="mt-3 text-sm leading-6 text-muted-ink">{item.content}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null,

    tips: () =>
      editorial.tips.length ? (
        <section className={WRAP}>
          <div className={`rounded-[1.4rem] ${c.soft} p-5 sm:p-6`}>
            <Heading accent={a}>{h.tips}</Heading>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-ink/85 md:grid-cols-2">
              {editorial.tips.map((item) => (
                <li key={item.sortOrder} className="flex gap-2"><span className={c.text} aria-hidden="true">✦</span><span>{item.content}</span></li>
              ))}
            </ul>
          </div>
        </section>
      ) : null,

    fitCheck: () =>
      page.fitCheck ? (
        <section className={WRAP}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className={`rounded-2xl border ${c.border} bg-white p-5`}>
              <h3 className={`font-display text-xl font-bold ${c.text}`}>Reach for it when</h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-ink">
                {page.fitCheck.goodFor.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">✓</span><span>{item}</span></li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5">
              <h3 className="font-display text-xl font-bold text-ink">Skip it when</h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-ink">
                {page.fitCheck.avoidFor.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">✕</span><span>{item}</span></li>)}
              </ul>
            </div>
          </div>
        </section>
      ) : null,

    difference: () =>
      editorial.differenceDescription ? (
        <section className={WRAP}>
          <div className="border-t border-dashed border-border pt-6">
            <Heading accent={a}>{h.difference}</Heading>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-ink">{editorial.differenceDescription}</p>
          </div>
        </section>
      ) : null,

    faq: () =>
      editorial.faq.length ? (
        <section className="mx-auto mt-10 w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="border-t border-dashed border-border pt-8">
            <Heading accent={a}>{h.faq}</Heading>
            <div className="mt-4"><TranslatorFaq faq={editorial.faq} /></div>
          </div>
        </section>
      ) : null,
  };

  return <>{layout.sections.map((key) => <div key={key}>{render[key]()}</div>)}</>;
}

function ExampleList({ style, accent, items }: { style: ExamplesStyle; accent: AccentKey; items: Array<{ title: string; input: string; output: string }> }) {
  const c = ACCENTS[accent];
  if (style === "chat") {
    return (
      <div className="mt-5 space-y-6">
        {items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="space-y-2">
            {item.title ? <p className="text-center text-[11px] font-extrabold uppercase tracking-wide text-muted-ink">{item.title}</p> : null}
            <p className="ml-auto max-w-[85%] break-words rounded-2xl rounded-br-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-ink sm:max-w-[60%]">{item.input}</p>
            <p className={`max-w-[85%] break-words rounded-2xl rounded-bl-sm ${c.solid} px-4 py-3 text-sm font-medium leading-6 text-white sm:max-w-[65%]`}>{item.output}</p>
          </div>
        ))}
      </div>
    );
  }
  if (style === "table") {
    return (
      <div className={`mt-5 overflow-hidden rounded-2xl border ${c.border} bg-white`}>
        <table className="w-full text-left text-sm">
          <thead className={`${c.soft} ${c.text}`}><tr><th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wide">Before</th><th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wide">After</th></tr></thead>
          <tbody className="divide-y divide-border">
            {items.map((item, index) => (
              <tr key={`${item.title}-${index}`}>
                <td className="w-1/2 px-4 py-3 align-top text-muted-ink">{item.title ? <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-ink">{item.title}</span> : null}{item.input}</td>
                <td className="px-4 py-3 align-top font-medium text-ink">{item.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (style === "quotes") {
    return (
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {items.map((item, index) => (
          <blockquote key={`${item.title}-${index}`} className={`border-l-4 ${c.border} bg-white py-1 pl-4`}>
            <p className="break-words text-sm leading-6 text-muted-ink line-through decoration-slate-300">{item.input}</p>
            <p className={`mt-2 break-words text-base font-semibold leading-7 ${c.text}`}>{item.output}</p>
            {item.title ? <footer className="mt-1 text-[11px] font-extrabold uppercase tracking-wide text-muted-ink">{item.title}</footer> : null}
          </blockquote>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      {items.map((item, index) => (
        <article key={`${item.title}-${index}`} className={`rounded-[1.2rem] border ${c.border} ${c.soft} p-4 sm:p-5`}>
          {item.title ? <p className={`text-xs font-extrabold uppercase tracking-[0.14em] ${c.text}`}>{item.title}</p> : null}
          <p className="mt-3 break-words text-sm leading-6 text-muted-ink">{item.input}</p>
          <p className="mt-3 break-words rounded-xl bg-white p-3 text-sm font-medium leading-6 text-ink">{item.output}</p>
        </article>
      ))}
    </div>
  );
}

function UsesBlock({ style, accent, heading, items }: { style: UsesStyle; accent: AccentKey; heading: string; items: string[] }) {
  const c = ACCENTS[accent];
  return (
    <section className={WRAP}>
      <Heading accent={accent}>{heading}</Heading>
      {style === "checklist" ? (
        <ul className="mt-5 max-w-3xl space-y-3">
          {items.map((item) => (
            <li key={item} className="flex gap-3 text-sm leading-6 text-muted-ink"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${c.solid} text-[11px] font-bold text-white`} aria-hidden="true">✓</span><span>{item}</span></li>
          ))}
        </ul>
      ) : style === "notes" ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {items.map((item, index) => (
            <p key={item} className={`rounded-2xl ${index % 2 ? "bg-white border border-border" : c.soft} p-4 text-sm leading-6 text-ink/85`}>{item}</p>
          ))}
        </div>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <li key={item} className={`relative overflow-hidden rounded-2xl border ${c.border} bg-white p-4`}>
              <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${c.bar}`} />
              <span className={`mr-2 font-display text-xs font-bold ${c.text}`}>{String(index + 1).padStart(2, "0")}</span>
              <span className="text-sm leading-6 text-muted-ink">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
