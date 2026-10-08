import Link from "next/link";

import { EmbeddedIdeaTranslator } from "@/components/public/embedded-idea-translator";
import type { IdeaBlock } from "@/lib/growth/ideas/contracts";

interface TranslatorRef { id: string; slug: string; name: string; shortDescription: string }

export function IdeaBlocks({ blocks, translators }: { blocks: IdeaBlock[]; translators: TranslatorRef[] }) {
  const byId = new Map(translators.map((item) => [item.id, item]));
  return <div className="space-y-6">{blocks.map((block, index) => {
    if (block.type === "INTRO") return <p key={index} className="text-xl leading-8 text-ink">{block.text}</p>;
    if (block.type === "PARAGRAPH") return <p key={index} className="text-base leading-8 text-muted-ink">{block.text}</p>;
    if (block.type === "HEADING") return block.level === 2 ? <h2 key={index} className="font-display pt-4 text-3xl font-bold text-ink">{block.text}</h2> : <h3 key={index} className="font-display pt-2 text-2xl font-bold text-ink">{block.text}</h3>;
    if (block.type === "IDEA_LIST") return <ol key={index} className="grid gap-4">{block.items.map((item, itemIndex) => <li key={itemIndex} className="rounded-2xl border border-border bg-white p-5"><div className="flex gap-4"><span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">{itemIndex + 1}</span><div><p className="font-bold leading-7 text-ink">{item.text}</p>{item.context ? <p className="mt-1 text-sm leading-6 text-muted-ink">{item.context}</p> : null}{item.note ? <p className="mt-2 text-sm italic leading-6 text-muted-ink">{item.note}</p> : null}</div></div></li>)}</ol>;
    if (block.type === "EXAMPLE_LIST") return <div key={index} className="grid gap-4">{block.items.map((item, itemIndex) => <article key={itemIndex} className="rounded-2xl border border-brand-200 bg-brand-50 p-5">{item.original ? <p className="text-sm text-muted-ink"><span className="font-bold">Instead:</span> {item.original}</p> : null}<p className="mt-2 font-bold leading-7 text-ink">{item.suggestion}</p>{item.explanation ? <p className="mt-2 text-sm leading-6 text-muted-ink">{item.explanation}</p> : null}</article>)}</div>;
    if (block.type === "TIP_LIST") return <ul key={index} className="space-y-3 rounded-[1.5rem] bg-[#fff0c7] p-5 sm:p-7">{block.items.map((item, itemIndex) => <li key={itemIndex} className="flex gap-3 leading-7 text-ink"><span aria-hidden="true" className="text-accent-600">✦</span><span>{item}</span></li>)}</ul>;
    if (block.type === "CALLOUT") return <aside key={index} className="border-l-4 border-accent-400 py-2 pl-5">{block.heading ? <h3 className="font-display text-xl font-bold text-ink">{block.heading}</h3> : null}<p className="mt-1 leading-7 text-muted-ink">{block.text}</p></aside>;
    const translator = byId.get(block.translatorId);
    if (!translator) return null;
    if (block.type === "TRANSLATOR_CTA") return <aside key={index} className="rounded-[1.5rem] bg-ink p-6 text-white"><h2 className="font-display text-2xl font-bold">{block.heading}</h2><p className="mt-2 max-w-2xl leading-7 text-white/75">{block.body}</p><Link href={`/translators/${translator.slug}`} className="mt-5 inline-flex rounded-full bg-brand-400 px-5 py-3 text-sm font-bold text-ink">{block.buttonLabel}</Link></aside>;
    return <EmbeddedIdeaTranslator key={index} slug={translator.slug} name={translator.name} heading={block.heading} helperText={block.helperText} />;
  })}</div>;
}

